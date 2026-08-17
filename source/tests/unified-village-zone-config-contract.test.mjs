import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..");
const read = (...parts) => readFile(join(SOURCE, ...parts), "utf8");

test("U3.3B define veintiséis zonas estables y persistentes", async () => {
  const registry = await read("apps", "api", "src", "village-zones.mjs");
  const migration = await read("packages", "database", "migrations", "0057_site_village_zones.sql");
  for (let index = 1; index <= 26; index++) {
    const key = `ZONE_${String(index).padStart(2, "0")}`;
    assert.ok(registry.includes(key), `falta ${key} en el registro`);
  }
  assert.match(migration, /2\[0-6\]/);
  assert.match(migration, /workshop_type text NOT NULL/);
  assert.match(migration, /provider_slug text NULL/);
  assert.match(migration, /ACTIVE','RESERVED','HIDDEN/);
  assert.match(migration, /site_village_zones_provider_slug_unique/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
});

test("U3.3B expone API pública y administración persistente", async () => {
  const api = await read("apps", "api", "src", "village-zones-api.mjs");
  const service = await read("apps", "api", "src", "village-zones-service.mjs");
  const server = await read("apps", "api", "src", "server.mjs");
  const proxy = await read("apps", "web", "src", "village-zones-proxy.mjs");
  const webServer = await read("apps", "web", "src", "server.mjs");

  assert.match(api, /\/api\/village-zones/);
  assert.match(api, /\/api\/admin\/village-zones/);
  assert.match(service, /VILLAGE_ZONE_CONFIGURED/);
  assert.match(service, /VILLAGE_PROVIDER_ALREADY_ASSIGNED/);
  assert.match(service, /SELECT \* FROM site_village_zones ORDER BY zone_key/);
  assert.match(server, /createVillageZonesApiHandler/);
  assert.match(server, /createVillageZonesService/);
  assert.match(server, /withOnboardingEmailDelivery\(\{ onboardingService: baseOnboardingService, mailService \}\)/);
  assert.match(proxy, /\/internal\/village-zones/);
  assert.match(proxy, /atelier_admin_session/);
  assert.match(webServer, /createVillageZonesWebHandler/);
});

test("U3.3B desacopla talleres del orden y respeta reservas manuales", async () => {
  const bootstrap = await read("apps", "web", "public", "entrada", "webgl", "bootstrap.js");
  const zones = await read("apps", "web", "public", "entrada", "webgl", "village-zones.js");
  const providers = await read("apps", "web", "public", "entrada", "webgl", "providers.js");
  const plaques = await read("apps", "web", "public", "entrada", "webgl", "workshop-plaques.js");

  assert.ok(bootstrap.indexOf("/entrada/webgl/village-zones.js") < bootstrap.indexOf("/entrada/webgl/providers.js"));
  assert.match(zones, /ZONE_26/);
  assert.match(zones, /assignProviders/);
  assert.match(zones, /reservedZones/);
  assert.match(zones, /if \(configured\(zone\.zoneKey\)\) return false/);
  assert.match(providers, /AtelierVillageZones/);
  assert.match(providers, /webglZonePlaceName/);
  assert.match(providers, /data\.webglAssignedZones|webglAssignedZones/);
  assert.match(providers, /webglCreateReservedZonePlace/);
  assert.match(plaques, /config\.workshopType/);
});

test("U3.3B ofrece un editor owner-only con oficio libre, taller y estado", async () => {
  const html = await read("apps", "web", "public", "admin", "pueblo", "index.html");
  const js = await read("apps", "web", "public", "admin", "pueblo", "pueblo.js");
  const showcase = await read("apps", "web", "public", "admin", "escaparate", "index.html");
  const navigation = await read("apps", "web", "public", "admin", "admin-role-navigation.js");

  assert.match(html, /Configura qué vive en cada zona/);
  assert.match(html, /Cerámica, Bordado, Joyería/);
  assert.match(js, /PLATFORM_OWNER/);
  assert.match(js, /Tipo de taller/);
  assert.match(js, /Sin taller asociado/);
  assert.match(js, /ACTIVE/);
  assert.match(js, /RESERVED/);
  assert.match(js, /HIDDEN/);
  assert.match(js, /method: 'PATCH'/);
  assert.match(js, /method: 'DELETE'/);
  assert.match(showcase, /href="\/admin\/pueblo\/"/);
  assert.match(navigation, /ensureOwnerLink\(actions, "\/admin\/pueblo\/", "Pueblo"\)/);
});
