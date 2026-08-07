import { spawnSync } from "node:child_process";

const validations = [
  "validate-source.mjs",
  "validate-public-home.mjs",
  "validate-public-accessibility.mjs",
  "validate-public-performance.mjs",
  "validate-premium-ui.mjs",
  "validate-public-error-pages.mjs",
  "validate-two-factor.mjs",
  "validate-provider-onboarding-ui.mjs",
  "validate-provider-session.mjs",
  "validate-smtp-email.mjs",
  "validate-account-recovery.mjs",
  "validate-provider-profile-editorial.mjs",
  "validate-provider-profile-media.mjs",
  "validate-provider-profile-featured-products.mjs",
  "validate-provider-profile-gallery-order.mjs",
  "validate-provider-products-ui.mjs",
  "validate-admin-products-review.mjs",
  "validate-public-catalog.mjs",
  "validate-public-provider-storefront.mjs",
  "validate-public-provider-filter.mjs",
  "validate-public-provider-operations.mjs",
  "validate-blog-editorial.mjs",
  "validate-provider-blog-ui.mjs",
  "validate-blog-media.mjs",
  "validate-admin-blog-review.mjs",
  "validate-public-blog.mjs",
  "validate-provider-orders.mjs",
  "validate-provider-orders-ui.mjs",
  "validate-customer-orders.mjs",
  "validate-order-email-notifications.mjs",
  "validate-request-files.mjs",
  "validate-request-files-ui.mjs",
  "validate-order-logistics.mjs",
  "validate-pilot-checkout.mjs",
  "validate-payment-sandbox.mjs",
  "validate-legal-privacy.mjs",
  "validate-admin-auth-web.mjs",
  "validate-admin-recovery.mjs",
  "validate-admin-permissions.mjs",
  "validate-admin-bootstrap.mjs",
  "validate-database-migrations.mjs",
  "validate-backup-restore.mjs",
  "validate-mini-pc-operator.mjs",
  "validate-production-pilot-operations.mjs"
];

for (const validation of validations) {
  console.log(`\n==> ${validation}`);
  const result = spawnSync(process.execPath, [`scripts/${validation}`], {
    cwd: new URL("..", import.meta.url),
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\nFalló ${validation}.`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nTodas las validaciones estáticas han finalizado correctamente.");