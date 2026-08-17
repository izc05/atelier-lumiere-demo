import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");
const PUBLIC = join(SOURCE, "apps", "web", "public");
const API = join(SOURCE, "apps", "api", "src");

async function text(...parts) {
  return readFile(join(...parts), "utf8");
}

async function assertExists(relativePath) {
  await assert.doesNotReject(
    () => access(join(PUBLIC, ...relativePath.split("/"))),
    `falta la superficie funcional heredada ${relativePath}`
  );
}

test("la experiencia unificada conserva las superficies Admin originales", async () => {
  for (const relativePath of [
    "admin/articulos/index.html",
    "admin/cuentas/index.html",
    "admin/proveedores/index.html",
    "admin/publicaciones/index.html",
    "admin/recuperar/index.html",
    "admin/talleres/index.html"
  ]) {
    await assertExists(relativePath);
  }
});

test("los roles Admin originales se conservan y V2 solo añade superficies de propietario", async () => {
  const navigation = await text(PUBLIC, "admin", "admin-role-navigation.js");

  for (const role of ["PLATFORM_OWNER", "EDITORIAL_REVIEWER", "PROVIDER_MANAGER"]) {
    assert.ok(navigation.includes(role), `falta el rol heredado ${role}`);
  }

  assert.match(navigation, /hideLinks\("\/admin\/proveedores\/"\)/);
  assert.match(navigation, /hideLinks\("\/admin\/articulos\/"\)/);
  assert.match(navigation, /hideLinks\("\/admin\/publicaciones\/"\)/);
  assert.match(navigation, /hideLinks\("\/admin\/talleres\/"\)/);

  assert.match(navigation, /\/admin\/escaparate\//);
  assert.match(navigation, /\/admin\/pueblo\//);
  assert.match(navigation, /if \(role === "PLATFORM_OWNER"\)/);
  assert.match(navigation, /if \(isPlatformOwnerSection\)/);
});

test("la cadena API funcional original sigue presente bajo la capa V2", async () => {
  const server = await text(API, "server.mjs");

  for (const symbol of [
    "createAdminAuthApiHandler",
    "createAdminRecoveryApiHandler",
    "createAdminAccountsApiHandler",
    "createAccountRecoveryApiHandler",
    "createBlogPostsApiHandler",
    "createBlogMediaApiHandler",
    "createProductsApiHandler",
    "createProductMediaApiHandler",
    "createProductMediaFocalApiHandler",
    "createProviderProfileApiHandler",
    "createProviderProfileMediaApiHandler",
    "createProviderOrdersApiHandler",
    "createCustomerOrdersApiHandler",
    "createCustomRequestFilesApiHandler",
    "createOrderLogisticsApiHandler",
    "createPilotCheckoutApiHandler",
    "createPaymentSandboxApiHandler",
    "createAdminBlogApiHandler",
    "createAdminProductsApiHandler",
    "createPublicBlogApiHandler",
    "createPublicCatalogApiHandler",
    "createLegalApiHandler",
    "createWorkshopApplicationsService",
    "createProviderOnboardingService",
    "createProviderAuthService"
  ]) {
    assert.ok(server.includes(symbol), `la integración V2 ha perdido ${symbol}`);
  }
});

test("Escaparate y Pueblo extienden la API sin reemplazar el backend original", async () => {
  const server = await text(API, "server.mjs");

  assert.match(server, /createShowcaseMediaApiHandler/);
  assert.match(server, /createShowcaseMediaService/);
  assert.match(server, /createVillageZonesApiHandler/);
  assert.match(server, /createVillageZonesService/);

  const adminProducts = server.indexOf("createAdminProductsApiHandler({");
  const showcase = server.indexOf("createShowcaseMediaApiHandler({");
  const village = server.indexOf("createVillageZonesApiHandler({");
  const publicBlog = server.indexOf("createPublicBlogApiHandler({");

  assert.ok(adminProducts >= 0, "falta Admin Products en la cadena");
  assert.ok(showcase > adminProducts, "Escaparate debe extender Admin, no sustituirlo");
  assert.ok(village > showcase, "Pueblo debe encadenarse detrás de Escaparate");
  assert.ok(publicBlog > village, "las APIs públicas heredadas deben seguir después de las extensiones V2");
});
