import { createHash, randomBytes } from "node:crypto";
import { ServiceError } from "./providers-service.mjs";
import { issueTwoFactorContinuation } from "./two-factor-service.mjs";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,180}$/;

function verificationToken(value) {
  const token = typeof value === "string" ? value.trim() : "";
  if (!TOKEN_PATTERN.test(token)) throw unavailableVerification();
  return token;
}

function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function maskEmail(value) {
  const [localPart, domain] = String(value).split("@");
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(2, localPart.length - visible.length))}@${domain}`;
}

function unavailableVerification() {
  return new ServiceError(
    "EMAIL_VERIFICATION_UNAVAILABLE",
    "El enlace de verificación no es válido, ha caducado o ya se ha utilizado.",
    410
  );
}

function suspendedProvider() {
  return new ServiceError(
    "PROVIDER_SUSPENDED",
    "El taller está suspendido y no puede completar la activación.",
    403
  );
}

async function writeAudit(transaction, {
  actorUserId,
  providerId,
  action,
  tokenId,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'email_verification_token', $4, $5::jsonb)`,
    [actorUserId, providerId, action, tokenId, JSON.stringify(metadata)]
  );
}

export async function issueEmailVerification(transaction, {
  userId,
  providerId,
  emailAddress,
  ttlHours,
  currentTime,
  auditAction = "PROVIDER_EMAIL_VERIFICATION_ISSUED"
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(currentTime.getTime() + ttlHours * 60 * 60 * 1000);

  await transaction.query(
    `UPDATE email_verification_tokens
     SET status = 'REVOKED', revoked_at = $2
     WHERE user_id = $1 AND status = 'PENDING'`,
    [userId, currentTime]
  );

  const result = await transaction.query(
    `INSERT INTO email_verification_tokens
      (user_id, provider_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, provider_id, status, expires_at, created_at`,
    [userId, providerId, tokenHash, expiresAt, currentTime]
  );

  const row = result.rows[0];
  await writeAudit(transaction, {
    actorUserId: userId,
    providerId,
    action: auditAction,
    tokenId: row.id,
    metadata: {
      expiresAt: row.expires_at,
      delivery: "PENDING"
    }
  });

  return {
    verification: {
      id: row.id,
      emailMasked: maskEmail(emailAddress),
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    },
    token: rawToken
  };
}

async function findByToken(transaction, tokenHash, { lock = false } = {}) {
  const result = await transaction.query(
    `SELECT
       evt.id, evt.user_id, evt.provider_id, evt.status, evt.expires_at, evt.created_at,
       u.email, u.display_name, u.status AS user_status,
       u.email_verified_at, u.two_factor_enabled,
       p.display_name AS provider_display_name, p.status AS provider_status,
       pm.id AS membership_id, pm.role AS membership_role, pm.status AS membership_status
     FROM email_verification_tokens evt
     INNER JOIN users u ON u.id = evt.user_id
     INNER JOIN providers p ON p.id = evt.provider_id
     INNER JOIN provider_members pm
       ON pm.user_id = evt.user_id
      AND pm.provider_id = evt.provider_id
     WHERE evt.token_hash = $1
     ${lock ? "FOR UPDATE OF evt, u, pm" : ""}`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

async function isLatestToken(transaction, row) {
  const result = await transaction.query(
    `SELECT id
     FROM email_verification_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [row.user_id]
  );
  return result.rows[0]?.id === row.id;
}

export function createEmailVerificationService({
  database,
  systemContext,
  tokenTtlHours = Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_HOURS ?? "24", 10),
  resendCooldownSeconds = Number.parseInt(
    process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS ?? "60",
    10
  ),
  twoFactorSetupTtlMinutes = Number.parseInt(
    process.env.TWO_FACTOR_SETUP_TTL_MINUTES ?? "15",
    10
  ),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createEmailVerificationService necesita una base de datos.");
  }
  if (!systemContext || systemContext.role !== "ADMIN") {
    throw new TypeError("La verificación necesita un contexto interno de administración.");
  }
  if (!Number.isInteger(tokenTtlHours) || tokenTtlHours < 1 || tokenTtlHours > 72) {
    throw new TypeError("EMAIL_VERIFICATION_TTL_HOURS debe estar entre 1 y 72.");
  }
  if (
    !Number.isInteger(resendCooldownSeconds)
    || resendCooldownSeconds < 30
    || resendCooldownSeconds > 3600
  ) {
    throw new TypeError(
      "EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS debe estar entre 30 y 3600."
    );
  }
  if (
    !Number.isInteger(twoFactorSetupTtlMinutes)
    || twoFactorSetupTtlMinutes < 5
    || twoFactorSetupTtlMinutes > 60
  ) {
    throw new TypeError("TWO_FACTOR_SETUP_TTL_MINUTES debe estar entre 5 y 60.");
  }

  return Object.freeze({
    async verify(rawToken) {
      const token = verificationToken(rawToken);
      const tokenHash = hashToken(token);
      const currentTime = now();

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const row = await findByToken(transaction, tokenHash, { lock: true });
        if (!row || !(await isLatestToken(transaction, row))) {
          return { unavailable: true };
        }
        if (row.provider_status === "SUSPENDED") throw suspendedProvider();
        if (row.status !== "PENDING" || row.email_verified_at) {
          return { unavailable: true };
        }

        if (new Date(row.expires_at).getTime() <= currentTime.getTime()) {
          await transaction.query(
            `UPDATE email_verification_tokens
             SET status = 'EXPIRED'
             WHERE id = $1 AND status = 'PENDING'`,
            [row.id]
          );
          await writeAudit(transaction, {
            actorUserId: row.user_id,
            providerId: row.provider_id,
            action: "PROVIDER_EMAIL_VERIFICATION_EXPIRED",
            tokenId: row.id
          });
          return { unavailable: true };
        }

        await transaction.query(
          `UPDATE email_verification_tokens
           SET status = 'VERIFIED', verified_at = $2
           WHERE id = $1`,
          [row.id, currentTime]
        );

        const userResult = await transaction.query(
          `UPDATE users
           SET email_verified_at = COALESCE(email_verified_at, $2)
           WHERE id = $1
           RETURNING id, email, display_name, status, email_verified_at, two_factor_enabled`,
          [row.user_id, currentTime]
        );

        const continuation = await issueTwoFactorContinuation(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          currentTime,
          ttlMinutes: twoFactorSetupTtlMinutes
        });

        await writeAudit(transaction, {
          actorUserId: row.user_id,
          providerId: row.provider_id,
          action: "PROVIDER_EMAIL_VERIFIED",
          tokenId: row.id,
          metadata: {
            nextRequiredStep: "ENABLE_2FA",
            setupExpiresAt: continuation.expiresAt
          }
        });

        const user = userResult.rows[0];
        return {
          provider: {
            id: row.provider_id,
            displayName: row.provider_display_name,
            status: row.provider_status
          },
          user: {
            id: user.id,
            emailMasked: maskEmail(user.email),
            displayName: user.display_name,
            status: user.status,
            emailVerified: Boolean(user.email_verified_at),
            twoFactorEnabled: user.two_factor_enabled
          },
          membership: {
            id: row.membership_id,
            role: row.membership_role,
            status: row.membership_status
          },
          twoFactorSetupToken: continuation.token,
          twoFactorSetupExpiresAt: continuation.expiresAt,
          nextSteps: ["ENABLE_2FA"],
          accessGranted: false
        };
      });

      if (outcome.unavailable) throw unavailableVerification();
      return outcome;
    },

    async resend(rawToken) {
      const token = verificationToken(rawToken);
      const tokenHash = hashToken(token);
      const currentTime = now();

      const outcome = await database.withContext(systemContext, async (transaction) => {
        const row = await findByToken(transaction, tokenHash, { lock: true });
        if (!row || !(await isLatestToken(transaction, row))) {
          return { unavailable: true };
        }
        if (row.provider_status === "SUSPENDED") throw suspendedProvider();
        if (row.email_verified_at || !["PENDING", "EXPIRED"].includes(row.status)) {
          return { unavailable: true };
        }

        const elapsedSeconds = Math.floor(
          (currentTime.getTime() - new Date(row.created_at).getTime()) / 1000
        );
        if (elapsedSeconds < resendCooldownSeconds) {
          throw new ServiceError(
            "EMAIL_VERIFICATION_RESEND_TOO_SOON",
            "Espera antes de solicitar otro enlace de verificación.",
            429,
            { retryAfterSeconds: resendCooldownSeconds - Math.max(0, elapsedSeconds) }
          );
        }

        const issued = await issueEmailVerification(transaction, {
          userId: row.user_id,
          providerId: row.provider_id,
          emailAddress: row.email,
          ttlHours: tokenTtlHours,
          currentTime,
          auditAction: "PROVIDER_EMAIL_VERIFICATION_REISSUED"
        });

        return {
          ...issued,
          accessGranted: false,
          nextSteps: ["VERIFY_EMAIL", "ENABLE_2FA"]
        };
      });

      if (outcome.unavailable) throw unavailableVerification();
      return outcome;
    }
  });
}
