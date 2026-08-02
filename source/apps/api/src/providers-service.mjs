import { createHash, randomBytes } from "node:crypto";

const PROVIDER_STATUSES = new Set(["ACTIVE", "SUSPENDED"]);
const INVITATION_ROLES = new Set(["PROVIDER_OWNER", "PROVIDER_MEMBER"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ServiceError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function requiredText(value, field, min, max) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < min || normalized.length > max) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      `${field} debe tener entre ${min} y ${max} caracteres.`,
      422,
      { field }
    );
  }
  return normalized;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, 2, max);
}

function email(value, field = "email") {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es válido.`, 422, { field });
  }
  return normalized;
}

function uuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ServiceError("VALIDATION_ERROR", `${field} no es un UUID válido.`, 422, { field });
  }
  return value.toLowerCase();
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function providerSlug(value, displayName) {
  const slug = slugify(typeof value === "string" && value.trim() ? value : displayName);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ServiceError("VALIDATION_ERROR", "No se ha podido generar un identificador válido.", 422, {
      field: "slug"
    });
  }
  return slug;
}

function invitationRole(value = "PROVIDER_OWNER") {
  if (!INVITATION_ROLES.has(value)) {
    throw new ServiceError("VALIDATION_ERROR", "El rol de invitación no es válido.", 422, {
      field: "role"
    });
  }
  return value;
}

function serializeProvider(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    legalName: row.legal_name,
    status: row.status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    specialty: row.specialty,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestInvitation: row.invitation_id
      ? {
          id: row.invitation_id,
          email: row.invitation_email,
          role: row.invitation_role,
          status: row.invitation_status,
          expiresAt: row.invitation_expires_at,
          createdAt: row.invitation_created_at
        }
      : null
  };
}

async function writeAudit(transaction, {
  actorUserId,
  providerId = null,
  action,
  entityType,
  entityId = null,
  metadata = {}
}) {
  await transaction.query(
    `INSERT INTO audit_events
      (actor_user_id, provider_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actorUserId, providerId, action, entityType, entityId, JSON.stringify(metadata)]
  );
}

async function issueInvitation(transaction, {
  providerId,
  emailAddress,
  role,
  invitedBy,
  invitationTtlHours,
  now
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(now().getTime() + invitationTtlHours * 60 * 60 * 1000);

  const result = await transaction.query(
    `INSERT INTO provider_invitations
      (provider_id, email, role, token_hash, expires_at, invited_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, provider_id, email, role, status, expires_at, created_at`,
    [providerId, emailAddress, role, tokenHash, expiresAt, invitedBy]
  );

  const row = result.rows[0];
  return {
    invitation: {
      id: row.id,
      providerId: row.provider_id,
      email: row.email,
      role: row.role,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    },
    token: rawToken
  };
}

export function createProvidersService({
  database,
  invitationTtlHours = Number.parseInt(process.env.INVITATION_TTL_HOURS ?? "48", 10),
  now = () => new Date()
} = {}) {
  if (!database || typeof database.withContext !== "function") {
    throw new TypeError("createProvidersService necesita una base de datos.");
  }
  if (!Number.isInteger(invitationTtlHours) || invitationTtlHours < 1 || invitationTtlHours > 168) {
    throw new TypeError("INVITATION_TTL_HOURS debe estar entre 1 y 168.");
  }

  return Object.freeze({
    async list(context) {
      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT
             p.id, p.slug, p.display_name, p.legal_name, p.status,
             p.contact_name, p.contact_email, p.specialty, p.created_at, p.updated_at,
             invitation.id AS invitation_id,
             invitation.email AS invitation_email,
             invitation.role AS invitation_role,
             invitation.status AS invitation_status,
             invitation.expires_at AS invitation_expires_at,
             invitation.created_at AS invitation_created_at
           FROM providers p
           LEFT JOIN LATERAL (
             SELECT pi.id, pi.email, pi.role, pi.status, pi.expires_at, pi.created_at
             FROM provider_invitations pi
             WHERE pi.provider_id = p.id
             ORDER BY pi.created_at DESC
             LIMIT 1
           ) invitation ON true
           ORDER BY p.created_at DESC`
        );
        return result.rows.map(serializeProvider);
      });
    },

    async create(context, input) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "Solo administración puede crear proveedores.", 403);
      }

      const displayName = requiredText(input?.displayName, "displayName", 2, 140);
      const contactName = requiredText(input?.contactName, "contactName", 2, 120);
      const contactEmail = email(input?.contactEmail, "contactEmail");
      const specialty = requiredText(input?.specialty, "specialty", 2, 160);
      const legalName = optionalText(input?.legalName, "legalName", 180);
      const slug = providerSlug(input?.slug, displayName);
      const role = invitationRole(input?.role);

      try {
        return await database.withContext(context, async (transaction) => {
          const providerResult = await transaction.query(
            `INSERT INTO providers
              (slug, display_name, legal_name, contact_name, contact_email, specialty, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, slug, display_name, legal_name, status,
                       contact_name, contact_email, specialty, created_at, updated_at`,
            [slug, displayName, legalName, contactName, contactEmail, specialty, context.userId]
          );

          const provider = serializeProvider(providerResult.rows[0]);
          const invitation = await issueInvitation(transaction, {
            providerId: provider.id,
            emailAddress: contactEmail,
            role,
            invitedBy: context.userId,
            invitationTtlHours,
            now: now()
          });

          await writeAudit(transaction, {
            actorUserId: context.userId,
            providerId: provider.id,
            action: "PROVIDER_CREATED",
            entityType: "provider",
            entityId: provider.id,
            metadata: { status: provider.status, invitationId: invitation.invitation.id }
          });

          return { provider, ...invitation };
        });
      } catch (error) {
        if (error?.code === "23505") {
          throw new ServiceError("PROVIDER_ALREADY_EXISTS", "Ya existe un proveedor con ese nombre técnico.", 409, {
            field: "slug"
          });
        }
        throw error;
      }
    },

    async setStatus(context, providerIdValue, statusValue) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "Solo administración puede cambiar el estado.", 403);
      }
      const providerId = uuid(providerIdValue, "providerId");
      const status = typeof statusValue === "string" ? statusValue.toUpperCase() : "";
      if (!PROVIDER_STATUSES.has(status)) {
        throw new ServiceError("VALIDATION_ERROR", "El estado debe ser ACTIVE o SUSPENDED.", 422, {
          field: "status"
        });
      }

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `UPDATE providers
           SET status = $2
           WHERE id = $1
           RETURNING id, slug, display_name, legal_name, status,
                     contact_name, contact_email, specialty, created_at, updated_at`,
          [providerId, status]
        );

        if (result.rowCount !== 1) {
          throw new ServiceError("PROVIDER_NOT_FOUND", "No se ha encontrado el proveedor.", 404);
        }

        await writeAudit(transaction, {
          actorUserId: context.userId,
          providerId,
          action: status === "ACTIVE" ? "PROVIDER_ACTIVATED" : "PROVIDER_SUSPENDED",
          entityType: "provider",
          entityId: providerId,
          metadata: { status }
        });

        return serializeProvider(result.rows[0]);
      });
    },

    async renewInvitation(context, providerIdValue, input = {}) {
      if (context?.role !== "ADMIN") {
        throw new ServiceError("FORBIDDEN", "Solo administración puede renovar invitaciones.", 403);
      }
      const providerId = uuid(providerIdValue, "providerId");
      const role = invitationRole(input.role);

      return database.withContext(context, async (transaction) => {
        const providerResult = await transaction.query(
          "SELECT id, contact_email FROM providers WHERE id = $1",
          [providerId]
        );
        if (providerResult.rowCount !== 1) {
          throw new ServiceError("PROVIDER_NOT_FOUND", "No se ha encontrado el proveedor.", 404);
        }

        const emailAddress = input.email ? email(input.email) : providerResult.rows[0].contact_email;
        await transaction.query(
          `UPDATE provider_invitations
           SET status = 'REVOKED'
           WHERE provider_id = $1 AND status = 'PENDING'`,
          [providerId]
        );

        const invitation = await issueInvitation(transaction, {
          providerId,
          emailAddress,
          role,
          invitedBy: context.userId,
          invitationTtlHours,
          now: now()
        });

        await writeAudit(transaction, {
          actorUserId: context.userId,
          providerId,
          action: "PROVIDER_INVITATION_RENEWED",
          entityType: "provider_invitation",
          entityId: invitation.invitation.id,
          metadata: { email: emailAddress, role }
        });

        return invitation;
      });
    },

    async audit(context, providerIdValue, limitValue = 50) {
      const providerId = uuid(providerIdValue, "providerId");
      const limit = Math.min(Math.max(Number.parseInt(limitValue, 10) || 50, 1), 100);

      return database.withContext(context, async (transaction) => {
        const result = await transaction.query(
          `SELECT id, actor_user_id, provider_id, action, entity_type, entity_id, metadata, created_at
           FROM audit_events
           WHERE provider_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [providerId, limit]
        );
        return result.rows.map((row) => ({
          id: String(row.id),
          actorUserId: row.actor_user_id,
          providerId: row.provider_id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          metadata: row.metadata,
          createdAt: row.created_at
        }));
      });
    }
  });
}
