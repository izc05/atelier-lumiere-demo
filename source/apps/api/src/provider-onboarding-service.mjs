import { createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { issueEmailVerification } from "./email-verification-service.mjs";
import { ServiceError } from "./providers-service.mjs";

const scryptAsync = promisify(scrypt);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;
const COMMON_PASSWORDS = new Set([
  "password1234",
  "contraseña1234",
  "atelierlumiere",
  "qwerty123456",
  "123456789012"
]);

function invitationToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!TOKEN_PATTERN.test(token)) throw unavailableInvitation();
  return token;
}

function displayName(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < 2 || normalized.length > 120) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "El nombre debe tener entre 2 y 120 caracteres.",
      422,
      { field: "displayName" }
    );
  }
  return normalized;
}

function password(value, { emailAddress, displayNameValue }) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña debe tener entre 12 y 128 caracteres.",
      422,
      { field: "password" }
    );
  }

  const lower = value.toLocaleLowerCase("es");
  const compact = lower.replace(/\s+/g, "");
  const emailLocalPart = String(emailAddress).split("@", 1)[0].toLocaleLowerCase("es");
  const normalizedName = displayNameValue.toLocaleLowerCase("es").replace(/\s+/g, "");

  if (
    COMMON_PASSWORDS.has(lower)
    || (emailLocalPart.length >= 4 && lower.includes(emailLocalPart))
    || (normalizedName.length >= 4 && compact.includes(normalizedName))
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "La contraseña es demasiado fácil de relacionar con la cuenta.",
      422,
      { field: "password" }
    );
  }

  return value;
}

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function maskEmail(value) {
  const [localPart, domain] = String(value).split("@");
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
}

async function hashPassword(rawPassword) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(rawPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return {
    passwordHash: Buffer.from(derivedKey).toString("base64url"),
    passwordSalt: salt,
    passwordAlgorithm: "scrypt-v1"
  };
}

function unavailableInvitation() {
  return new ServiceError(
    "INVITATION_UNAVAILABLE",
    "La invitación no es válida, ha caducado o ya se ha utilizado.",
    410
  );
}

function isInvitationAvailable(row, currentTime) {
  return Boolean(
    row
    && row.status === "PENDING"
    && row.provider_status !== "SUSPENDED"
    && new Date(row.expires_at).getTime() > currentTime.getTime()
  );
}

async function findInvitation(transaction, tokenHash, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       pi.id, pi.provider_id, pi.email, pi.role, pi.status, pi.expires_at,
       p.display_name AS provider_display_name,
       p.specialty AS provider_specialty,
       p.status AS provider_status
     FROM provider_invitations pi
     INNER JOIN providers p ON p.id = pi.provider_id
     WHERE pi.token_hash = $1
     ${lock ? "FOR UPDATE OF pi" : ""}`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export function createProviderOnboardingService({
  database,
  systemContext,
  emailVerificationTtlHours = Number.parseInt(
    process.env.EMAIL_VERIFICATION_TTL_HOURS ?? "24",
    10
  ),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProviderOnboardingService necesita una base de datos.");
  }
  if (!systemContext || !["ADMIN", "AUTH_SERVICE"].includes(systemContext.role) || systemContext.providerId) {
    throw new TypeError("La incorporación necesita un contexto interno de administración.");
  }
  if (
    !Number.isInteger(emailVerificationTtlHours)
    || emailVerificationTtlHours < 1
    || emailVerificationTtlHours > 72
  ) {
    throw new TypeError("EMAIL_VERIFICATION_TTL_HOURS debe estar entre 1 y 72.");
  }

  async function loadAvailableInvitation(tokenHash) {
    return database.withContext(systemContext, async (transaction) => {
      const invitation = await findInvitation(transaction, tokenHash);
      if (!isInvitationAvailable(invitation, now())) throw unavailableInvitation();
      return invitation;
    });
  }

  return Object.freeze({
    async preview(rawToken) {
      const token = invitationToken(rawToken);
      const invitation = await loadAvailableInvitation(hashToken(token));

      return {
        provider: {
          displayName: invitation.provider_display_name,
          specialty: invitation.provider_specialty
        },
        invitation: {
          role: invitation.role,
          emailMasked: maskEmail(invitation.email),
          expiresAt: invitation.expires_at
        },
        requiredSteps: ["CREATE_PASSWORD", "VERIFY_EMAIL", "ENABLE_2FA"]
      };
    },

    async accept(input = {}) {
      const token = invitationToken(input.token);
      const name = displayName(input.displayName);
      const tokenHash = hashToken(token);
      const preflightInvitation = await loadAvailableInvitation(tokenHash);
      const rawPassword = password(input.password, {
        emailAddress: preflightInvitation.email,
        displayNameValue: name
      });
      const credential = await hashPassword(rawPassword);

      try {
        return await database.withContext(systemContext, async (transaction) => {
          const currentTime = now();
          const invitation = await findInvitation(transaction, tokenHash, { lock: true });
          if (!isInvitationAvailable(invitation, currentTime)) throw unavailableInvitation();

          const existingUser = await transaction.query(
            "SELECT id FROM users WHERE email = $1",
            [invitation.email]
          );
          if (existingUser.rowCount > 0) {
            throw new ServiceError(
              "ACCOUNT_ALREADY_EXISTS",
              "Ya existe una cuenta asociada a este correo.",
              409
            );
          }

          const userResult = await transaction.query(
            `INSERT INTO users (email, display_name, status)
             VALUES ($1, $2, 'PENDING')
             RETURNING id, email, display_name, status, email_verified_at,
                       two_factor_enabled, created_at`,
            [invitation.email, name]
          );
          const user = userResult.rows[0];

          await transaction.query(
            `INSERT INTO user_credentials
              (user_id, password_hash, password_salt, password_algorithm)
             VALUES ($1, $2, $3, $4)`,
            [
              user.id,
              credential.passwordHash,
              credential.passwordSalt,
              credential.passwordAlgorithm
            ]
          );

          const membershipResult = await transaction.query(
            `INSERT INTO provider_members (provider_id, user_id, role, status)
             VALUES ($1, $2, $3, 'INVITED')
             RETURNING id, provider_id, user_id, role, status, created_at`,
            [invitation.provider_id, user.id, invitation.role]
          );

          await transaction.query(
            `UPDATE provider_invitations
             SET status = 'ACCEPTED', accepted_by = $2, accepted_at = $3
             WHERE id = $1`,
            [invitation.id, user.id, currentTime]
          );

          const emailVerification = await issueEmailVerification(transaction, {
            userId: user.id,
            providerId: invitation.provider_id,
            emailAddress: user.email,
            ttlHours: emailVerificationTtlHours,
            currentTime
          });

          await transaction.query(
            `INSERT INTO audit_events
              (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'PROVIDER_INVITATION_ACCEPTED',
                     'provider_invitation', $3, $4::jsonb)`,
            [
              user.id,
              invitation.provider_id,
              invitation.id,
              JSON.stringify({
                membershipId: membershipResult.rows[0].id,
                verificationTokenId: emailVerification.verification.id,
                role: invitation.role,
                nextRequiredStep: "VERIFY_EMAIL"
              })
            ]
          );

          return {
            provider: {
              id: invitation.provider_id,
              displayName: invitation.provider_display_name,
              specialty: invitation.provider_specialty,
              status: invitation.provider_status
            },
            user: {
              id: user.id,
              email: user.email,
              displayName: user.display_name,
              status: user.status,
              emailVerified: Boolean(user.email_verified_at),
              twoFactorEnabled: user.two_factor_enabled,
              createdAt: user.created_at
            },
            membership: {
              id: membershipResult.rows[0].id,
              role: membershipResult.rows[0].role,
              status: membershipResult.rows[0].status
            },
            emailVerification: emailVerification.verification,
            verificationToken: emailVerification.token,
            nextSteps: ["VERIFY_EMAIL", "ENABLE_2FA"],
            accessGranted: false
          };
        });
      } catch (error) {
        if (error?.code === "23505") {
          throw new ServiceError(
            "ACCOUNT_ALREADY_EXISTS",
            "Ya existe una cuenta asociada a este correo.",
            409
          );
        }
        throw error;
      }
    }
  });
}
