function failedDelivery(error) {
  return {
    status: "FAILED",
    messageId: null,
    accepted: [],
    rejected: [],
    errorCode: typeof error?.code === "string" ? error.code : "SMTP_DELIVERY_FAILED"
  };
}

function disabledDelivery() {
  return {
    status: "DISABLED",
    messageId: null,
    accepted: [],
    rejected: []
  };
}

async function safelyDeliver(operation, logger, context) {
  try {
    return await operation();
  } catch (error) {
    logger.error("No se pudo entregar un correo transaccional.", {
      template: context.template,
      providerId: context.providerId,
      entityId: context.entityId,
      errorCode: typeof error?.code === "string" ? error.code : "SMTP_DELIVERY_FAILED"
    });
    return failedDelivery(error);
  }
}

function mailerReady(mailService) {
  return Boolean(mailService?.enabled);
}

function stageFor(provider, account) {
  if (provider.status === "SUSPENDED") return "SUSPENDED";
  if (provider.status === "ACTIVE") return "ACTIVE";
  if (!account?.user_id) return "INVITED";
  if (!account.email_verified_at) return "ACCOUNT_CREATED";
  if (!account.two_factor_enabled) return "EMAIL_VERIFIED";
  if (account.membership_status !== "ACTIVE") return "TWO_FACTOR_ENABLED";
  return "PENDING_APPROVAL";
}

function onboardingDetails(provider, account) {
  const accountCreated = Boolean(account?.user_id);
  const emailVerified = Boolean(account?.email_verified_at);
  const twoFactorEnabled = Boolean(account?.two_factor_enabled);
  const membershipActive = account?.membership_status === "ACTIVE";
  const invitationAccepted = accountCreated || provider.latestInvitation?.status === "ACCEPTED";

  return {
    stage: stageFor(provider, account),
    invitationCreated: Boolean(provider.latestInvitation),
    invitationAccepted,
    accountCreated,
    emailVerified,
    twoFactorEnabled,
    membershipActive,
    approved: provider.status === "ACTIVE",
    userStatus: account?.user_status ?? null,
    membershipStatus: account?.membership_status ?? null,
    membershipRole: account?.membership_role ?? null
  };
}

async function loadProviderAccounts(database, context) {
  if (!database || typeof database.withContext !== "function") return new Map();
  return database.withContext(context, async (transaction) => {
    const result = await transaction.query(
      `SELECT
         p.id AS provider_id,
         account.user_id,
         account.user_status,
         account.email_verified_at,
         account.two_factor_enabled,
         account.membership_status,
         account.membership_role
       FROM providers p
       LEFT JOIN LATERAL (
         SELECT
           u.id AS user_id,
           u.status AS user_status,
           u.email_verified_at,
           u.two_factor_enabled,
           pm.status AS membership_status,
           pm.role AS membership_role
         FROM provider_members pm
         INNER JOIN users u ON u.id = pm.user_id
         WHERE pm.provider_id = p.id
         ORDER BY
           CASE WHEN pm.role = 'PROVIDER_OWNER' THEN 0 ELSE 1 END,
           pm.created_at ASC
         LIMIT 1
       ) account ON true`
    );
    return new Map(result.rows.map((row) => [row.provider_id, row]));
  });
}

export function withProviderInvitationDelivery({
  providersService,
  mailService,
  database,
  logger = console
}) {
  if (!providersService) return null;

  async function list(context) {
    const providers = await providersService.list(context);
    const accounts = await loadProviderAccounts(database, context);
    return providers.map((provider) => ({
      ...provider,
      onboarding: onboardingDetails(provider, accounts.get(provider.id))
    }));
  }

  return Object.freeze({
    list,
    setStatus: (...args) => providersService.setStatus(...args),
    audit: (...args) => providersService.audit(...args),

    async create(context, input) {
      const result = await providersService.create(context, input);
      const emailDelivery = mailerReady(mailService)
        ? await safelyDeliver(
            () => mailService.sendInvitation({
              to: result.invitation.email,
              contactName: result.provider.contactName,
              providerName: result.provider.displayName,
              token: result.token,
              expiresAt: result.invitation.expiresAt
            }),
            logger,
            {
              template: "PROVIDER_INVITATION",
              providerId: result.provider.id,
              entityId: result.invitation.id
            }
          )
        : disabledDelivery();
      return { ...result, emailDelivery };
    },

    async renewInvitation(context, providerId, input) {
      const result = await providersService.renewInvitation(context, providerId, input);
      const providers = await list(context);
      const provider = providers.find((candidate) => candidate.id === providerId);
      const emailDelivery = mailerReady(mailService) && provider
        ? await safelyDeliver(
            () => mailService.sendInvitation({
              to: result.invitation.email,
              contactName: provider.contactName,
              providerName: provider.displayName,
              token: result.token,
              expiresAt: result.invitation.expiresAt
            }),
            logger,
            {
              template: "PROVIDER_INVITATION",
              providerId,
              entityId: result.invitation.id
            }
          )
        : disabledDelivery();
      return { ...result, emailDelivery };
    }
  });
}

export function withOnboardingEmailDelivery({
  onboardingService,
  mailService,
  logger = console
}) {
  if (!onboardingService) return null;

  return Object.freeze({
    preview: (...args) => onboardingService.preview(...args),

    async accept(input) {
      const result = await onboardingService.accept(input);
      const emailDelivery = mailerReady(mailService)
        ? await safelyDeliver(
            () => mailService.sendEmailVerification({
              to: result.user.email,
              displayName: result.user.displayName,
              providerName: result.provider.displayName,
              token: result.verificationToken,
              expiresAt: result.emailVerification.expiresAt
            }),
            logger,
            {
              template: "PROVIDER_EMAIL_VERIFICATION",
              providerId: result.provider.id,
              entityId: result.emailVerification.id
            }
          )
        : disabledDelivery();
      return { ...result, emailDelivery };
    }
  });
}

async function loadVerificationRecipient(database, systemContext, verificationId) {
  return database.withContext(systemContext, async (transaction) => {
    const result = await transaction.query(
      `SELECT
         evt.id,
         evt.provider_id,
         evt.expires_at,
         u.email,
         u.display_name,
         p.display_name AS provider_display_name
       FROM email_verification_tokens evt
       INNER JOIN users u ON u.id = evt.user_id
       INNER JOIN providers p ON p.id = evt.provider_id
       WHERE evt.id = $1`,
      [verificationId]
    );
    return result.rows[0] ?? null;
  });
}

export function withVerificationEmailDelivery({
  emailVerificationService,
  mailService,
  database,
  systemContext,
  logger = console
}) {
  if (!emailVerificationService) return null;

  return Object.freeze({
    verify: (...args) => emailVerificationService.verify(...args),

    async resend(token) {
      const result = await emailVerificationService.resend(token);
      let emailDelivery = disabledDelivery();

      if (mailerReady(mailService)) {
        const recipient = await loadVerificationRecipient(
          database,
          systemContext,
          result.verification.id
        );
        if (recipient) {
          emailDelivery = await safelyDeliver(
            () => mailService.sendEmailVerification({
              to: recipient.email,
              displayName: recipient.display_name,
              providerName: recipient.provider_display_name,
              token: result.token,
              expiresAt: recipient.expires_at
            }),
            logger,
            {
              template: "PROVIDER_EMAIL_VERIFICATION",
              providerId: recipient.provider_id,
              entityId: recipient.id
            }
          );
        }
      }

      return { ...result, emailDelivery };
    }
  });
}
