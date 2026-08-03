export const CORE_TABLES = Object.freeze([
  "users",
  "user_credentials",
  "email_verification_tokens",
  "onboarding_continuations",
  "user_totp_credentials",
  "user_recovery_codes",
  "account_recovery_tokens",
  "providers",
  "provider_members",
  "provider_invitations",
  "sessions",
  "login_throttles",
  "provider_login_challenges",
  "audit_events"
]);

export const CATALOG_TABLES = Object.freeze([
  "products",
  "product_media",
  "product_events",
  "product_personalization_options",
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

export const LEGAL_TABLES = Object.freeze([
  "legal_documents",
  "legal_consent_events",
  "checkout_legal_snapshots",
  "privacy_preference_records"
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
  providerLoginRequiresTwoIndependentFactors: true,
  providerSessionsStoreOnlyTokenHashes: true,
  providerLoginHasPasswordAndChallengeThrottling: true,
  providerAccessRequiresVerifiedEmailAndTwoFactor: true,
  productsAreTenantIsolated: true,
  providersCanEditOnlyDraftOrReturnedProducts: true,
  productReviewRequiresAtLeastOneReadyImage: true,
  productMediaUsesPrivateStorageKeys: true,
  productMediaBytesStayOutsidePostgreSQLAndGit: true,
  productMediaContentIsValidatedByBinarySignature: true,
  productMediaUploadsAreStreamedThroughTemporaryFiles: true,
  productMediaReservationsExpire: true,
  productMediaReadsRequireProviderSession: true,
  productImagesGenerateMetadataStrippedWebpPreviews: true,
  productMediaAllowsAtMostEightImagesAndOneVideo: true,
  publishedProductsRequireAdministrativeApproval: true,
  legalDocumentsAreVersionedAndHashed: true,
  publishedLegalDocumentsRequireProfessionalReview: true,
  publishedLegalDocumentsAreImmutable: true,
  retiredLegalDocumentsAreImmutable: true,
  legalDraftsAreHiddenInProduction: true,
  checkoutLegalSnapshotsAreImmutable: true,
  privacyKeysAreStoredOnlyAsHashes: true,
  consentEventsAreAppendOnly: true,
  optionalPrivacyCategoriesDefaultToDisabled: true,
  legalServiceHasDedicatedDatabaseRole: true
});
