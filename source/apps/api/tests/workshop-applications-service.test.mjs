import test from "node:test";
import assert from "node:assert/strict";
import { createWorkshopApplicationsService } from "../src/workshop-applications-service.mjs";

const SYSTEM_CONTEXT = Object.freeze({
  role: "AUTH_SERVICE",
  userId: "00000000-0000-4000-8000-000000000008"
});

function row(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000681",
    display_name: "Taller del Mar",
    legal_name: null,
    contact_name: "Ana Artesana",
    contact_email: "ana@example.test",
    specialty: "Cerámica",
    website_url: null,
    message: "Mensaje privado para Atelier Lumière.",
    phone: "+34 612 345 678",
    proposed_slug: "taller-del-mar",
    work_description: "Creamos cerámica de forma artesanal.",
    applicant_story: "El taller nació como un pequeño proyecto familiar.",
    social_networks: { instagram: "@tallerdelmar" },
    admin_notes: null,
    privacy_accepted_at: "2026-08-12T12:00:00.000Z",
    privacy_document_version: "0.1.0",
    submission_version: 2,
    status: "PENDING",
    review_note: null,
    reviewed_at: null,
    provider_id: null,
    created_at: "2026-08-12T12:00:00.000Z",
    updated_at: "2026-08-12T12:00:00.000Z",
    ...overrides
  };
}

test("registra en servidor el consentimiento y todos los campos del contrato v2", async () => {
  let captured;
  const database = {
    async withContext(context, operation) {
      assert.equal(context, SYSTEM_CONTEXT);
      return operation({
        async query(sql, values) {
          captured = { sql, values };
          return { rowCount: 1, rows: [row()] };
        }
      });
    }
  };
  const service = createWorkshopApplicationsService({
    database,
    systemContext: SYSTEM_CONTEXT,
    privacyDocumentVersion: "0.1.0"
  });

  const application = await service.submit({
    displayName: " Taller del Mar ",
    contactName: " Ana Artesana ",
    contactEmail: "ANA@EXAMPLE.TEST",
    specialty: "Cerámica",
    message: "Mensaje privado para Atelier Lumière.",
    phone: "+34 612 345 678",
    proposedSlug: "Taller-del-Mar",
    workDescription: "Creamos cerámica de forma artesanal.",
    applicantStory: "El taller nació como un pequeño proyecto familiar.",
    socialNetworks: { instagram: "@tallerdelmar" },
    privacyAccepted: true
  });

  assert.match(captured.sql, /privacy_accepted_at/);
  assert.match(captured.sql, /now\(\)/);
  assert.deepEqual(captured.values.slice(7), [
    "+34 612 345 678",
    "taller-del-mar",
    "Creamos cerámica de forma artesanal.",
    "El taller nació como un pequeño proyecto familiar.",
    JSON.stringify({ instagram: "@tallerdelmar" }),
    "0.1.0",
    2
  ]);
  assert.equal(application.submissionVersion, 2);
  assert.equal(application.privacyDocumentVersion, "0.1.0");
  assert.equal(application.adminNotes, null);
});

test("rechaza el envío cuando no consta la aceptación de privacidad", async () => {
  let databaseCalled = false;
  const service = createWorkshopApplicationsService({
    database: {
      async withContext() {
        databaseCalled = true;
      }
    },
    systemContext: SYSTEM_CONTEXT
  });

  await assert.rejects(
    service.submit({
      displayName: "Taller del Mar",
      contactName: "Ana Artesana",
      contactEmail: "ana@example.test",
      specialty: "Cerámica"
    }),
    (error) => error.code === "PRIVACY_CONSENT_REQUIRED" && error.statusCode === 422
  );
  assert.equal(databaseCalled, false);
});

test("distingue un slug ya asignado de un correo con solicitud activa", async () => {
  const service = createWorkshopApplicationsService({
    database: {
      async withContext() {
        const error = new Error("conflict");
        error.code = "23505";
        error.constraint = "workshop_applications_proposed_slug_provider_conflict";
        throw error;
      }
    },
    systemContext: SYSTEM_CONTEXT
  });

  await assert.rejects(
    service.submit({
      displayName: "Taller del Mar",
      contactName: "Ana Artesana",
      contactEmail: "ana@example.test",
      specialty: "Cerámica",
      proposedSlug: "taller-existente",
      privacyAccepted: true
    }),
    (error) => error.code === "PROPOSED_SLUG_UNAVAILABLE" && error.statusCode === 409
  );
});

test("admite CHANGES_REQUESTED como filtro administrativo real", async () => {
  let statusParameter;
  const service = createWorkshopApplicationsService({
    database: {
      async withContext(_context, operation) {
        return operation({
          async query(_sql, values) {
            [statusParameter] = values;
            return { rowCount: 0, rows: [] };
          }
        });
      }
    },
    systemContext: SYSTEM_CONTEXT
  });

  const result = await service.list({ role: "ADMIN" }, "CHANGES_REQUESTED");
  assert.deepEqual(result, []);
  assert.equal(statusParameter, "CHANGES_REQUESTED");
});
