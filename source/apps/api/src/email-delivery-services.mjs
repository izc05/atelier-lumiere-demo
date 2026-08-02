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

export function withProviderInvitationDelivery({
  providersService,
  mailService,
  logger = console
}) {
  if (!providersService) return null;

  return Object.freeze({
    list: (...args) => providersService.list(...args),
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
      const providers = await providersService.list(context);
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
