import test from "node:test";
import assert from "node:assert/strict";
import { createPublicCatalogService } from "../src/public-catalog-service.mjs";

const UUID = "00000000-0000-4000-8000-000000000123";

test("el directorio usa únicamente snapshots publicados de talleres activos", async () => {
  const queries = [];
  const database = {
    async withContext(context, work) {
      assert.equal(context.role, "CATALOG_READER");
      return work({
        async query(sql, params) {
          queries.push({ sql, params });
          return {
            rows: [{
              provider_slug: "taller-luz",
              provider_display_name: "Nombre de cuenta privado",
              provider_specialty: "Especialidad de cuenta",
              provider_profile_revision: 4,
              provider_profile_published_at: "2026-08-08T09:00:00.000Z",
              provider_profile_snapshot: {
                displayName: "Taller Luz",
                specialty: "Bordado contemporáneo",
                tagline: "Piezas bordadas para conservar recuerdos.",
                locationLabel: "Granada",
                acceptsCustomRequests: true,
                materials: ["Lino"],
                techniques: ["Bordado"],
                media: [{
                  id: UUID,
                  kind: "COVER",
                  altText: "Mesa del taller",
                  previewWidth: 960,
                  previewHeight: 640
                }]
              },
              published_product_count: 0
            }]
          };
        }
      });
    }
  };
  const storage = {
    async openPreview() { throw new Error("no usado"); },
    async openRead() { throw new Error("no usado"); }
  };

  const service = createPublicCatalogService({ database, storage });
  const providers = await service.listProviders({ query: "luz", customOnly: true });

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /FROM provider_profile_publications publication/);
  assert.match(queries[0].sql, /provider\.status = 'ACTIVE'/);
  assert.doesNotMatch(queries[0].sql, /FROM provider_profiles profile/);
  assert.deepEqual(queries[0].params, ["luz", "", true, 100]);
  assert.deepEqual(providers, [{
    slug: "taller-luz",
    displayName: "Taller Luz",
    specialty: "Bordado contemporáneo",
    tagline: "Piezas bordadas para conservar recuerdos.",
    locationLabel: "Granada",
    story: null,
    craftDescription: null,
    materials: ["Lino"],
    techniques: ["Bordado"],
    preparationNote: null,
    shippingNote: null,
    acceptsCustomRequests: true,
    featuredProductIds: [],
    profileRevision: 4,
    publishedAt: "2026-08-08T09:00:00.000Z",
    publishedProductCount: 0,
    logo: null,
    cover: {
      id: UUID,
      kind: "COVER",
      altText: "Mesa del taller",
      width: 960,
      height: 640,
      sortOrder: 0,
      path: `/api/catalog/providers/taller-luz/media/${UUID}/preview`
    },
    gallery: []
  }]);
});
