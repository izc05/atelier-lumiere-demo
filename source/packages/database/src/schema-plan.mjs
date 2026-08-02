export const CORE_TABLES = Object.freeze([
  "users",
  "user_credentials",
  "email_verification_tokens",
  "onboarding_continuations",
  "user_totp_credentials",
  "user_recovery_codes",
  "providers",
  "provider_members",
  "provider_invitations",
  "sessions",
  "audit_events"
]);

export const CATALOG_TABLES = Object.freeze([
  "products",
  "product_media",
  "product_events",
  "product_reviews"
]);

export const EDITORIAL_TABLES = Object.freeze([
  "blog_posts",
  "blog_media",
  "blog_product_links",
  "blog_reviews"
]);

export const COMMERCE_TABLES = Object.freeze([
  "orders",
  "provider_orders",
  "order_items",
  "order_events",
  "custom_commissions"
]);

export const DATABASE_RULES = Object.freeze({
  providerScopedTablesRequireProviderId: true,
  allMutationsCreateAuditEvent: true,
  hardDeleteProviders: false,
  timestampsStoredAsUtc: true,
  passwordsStoredWithScrypt: true,
  emailVerificationTokensAreHashedAndSingleUse: true,
  totpSecretsEncryptedWithAuthenticatedEncryption: true,
  recoveryCodesStoredAsKeyedHashes: true,
  twoFactorSetupHasLimitedAttempts: true,
  providerAccessRequiresVerifiedEmailAndTwoFactor: true
});
