BEGIN;

INSERT INTO users (
  id, email, display_name, status, email_verified_at, two_factor_enabled
) VALUES (
  '00000000-0000-4000-8000-000000000007',
  'legal-service@atelier.invalid',
  'Servicio legal Atelier Lumière',
  'ACTIVE',
  now(),
  false
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE legal_documents
  ADD COLUMN summary text NOT NULL DEFAULT ''
    CHECK (char_length(summary) <= 600);

ALTER TABLE legal_documents
  ADD CONSTRAINT legal_documents_active_requires_professional_review
  CHECK (status <> 'ACTIVE' OR review_status = 'PROFESSIONAL_REVIEWED')
  NOT VALID;

CREATE OR REPLACE FUNCTION app.protect_legal_document_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'RETIRED' THEN
    RAISE EXCEPTION 'RETIRED_LEGAL_DOCUMENT_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'ACTIVE' THEN
    IF NEW.status NOT IN ('ACTIVE', 'RETIRED')
       OR NEW.document_type IS DISTINCT FROM OLD.document_type
       OR NEW.locale IS DISTINCT FROM OLD.locale
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.summary IS DISTINCT FROM OLD.summary
       OR NEW.content_markdown IS DISTINCT FROM OLD.content_markdown
       OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
       OR NEW.review_status IS DISTINCT FROM OLD.review_status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'ACTIVE_LEGAL_DOCUMENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_documents_protect_lifecycle
BEFORE UPDATE ON legal_documents
FOR EACH ROW EXECUTE FUNCTION app.protect_legal_document_lifecycle();

CREATE TABLE privacy_preference_records (
  preference_key_hash char(64) PRIMARY KEY
    CHECK (preference_key_hash ~ '^[a-f0-9]{64}$'),
  legal_document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  necessary boolean NOT NULL DEFAULT true CHECK (necessary = true),
  preferences boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.prepare_privacy_preference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.necessary := true;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER privacy_preferences_prepare
BEFORE INSERT OR UPDATE ON privacy_preference_records
FOR EACH ROW EXECUTE FUNCTION app.prepare_privacy_preference();

ALTER TABLE privacy_preference_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_preference_records FORCE ROW LEVEL SECURITY;

CREATE POLICY privacy_preferences_admin_all ON privacy_preference_records
  FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY legal_documents_service_select ON legal_documents
  FOR SELECT USING (app.current_role() = 'LEGAL_SERVICE');

CREATE POLICY privacy_preferences_service_select ON privacy_preference_records
  FOR SELECT USING (app.current_role() = 'LEGAL_SERVICE');
CREATE POLICY privacy_preferences_service_insert ON privacy_preference_records
  FOR INSERT WITH CHECK (app.current_role() = 'LEGAL_SERVICE');
CREATE POLICY privacy_preferences_service_update ON privacy_preference_records
  FOR UPDATE
  USING (app.current_role() = 'LEGAL_SERVICE')
  WITH CHECK (app.current_role() = 'LEGAL_SERVICE');

CREATE POLICY legal_consent_events_service_select ON legal_consent_events
  FOR SELECT USING (app.current_role() = 'LEGAL_SERVICE');
CREATE POLICY legal_consent_events_service_insert ON legal_consent_events
  FOR INSERT WITH CHECK (app.current_role() = 'LEGAL_SERVICE');

GRANT SELECT, INSERT, UPDATE ON privacy_preference_records TO atelier_app_runtime;

INSERT INTO legal_documents (
  document_type, locale, version, title, summary,
  content_markdown, content_sha256, status, review_status, created_by
)
SELECT
  draft.document_type,
  'es-ES',
  '0.1.0',
  draft.title,
  draft.summary,
  draft.content_markdown,
  encode(digest(draft.content_markdown, 'sha256'), 'hex'),
  'DRAFT',
  'TECHNICAL_DRAFT',
  '00000000-0000-4000-8000-000000000007'::uuid
FROM (VALUES
  (
    'LEGAL_NOTICE',
    'Aviso legal',
    'Identificación del titular y reglas generales de uso del sitio.',
    $legal$# Borrador técnico de aviso legal

> No apto todavía para ventas reales. Pendiente de revisión profesional y de completar los datos identificativos.

## Titular del sitio

- **Titular o razón social:** [TITULAR / RAZÓN SOCIAL PENDIENTE]
- **NIF:** [NIF PENDIENTE]
- **Domicilio:** [DOMICILIO LEGAL PENDIENTE]
- **Correo legal:** [EMAIL LEGAL PENDIENTE]
- **Datos registrales, si proceden:** [REGISTRO PENDIENTE]

## Finalidad

Atelier Lumière es una plataforma para presentar piezas artesanales, historias de talleres y pedidos separados por proveedor. Durante el piloto no procesa pagos reales.

## Uso y responsabilidad

La persona usuaria deberá utilizar el sitio de forma lícita y no interferir en su seguridad. El reparto de responsabilidades entre la plataforma y cada taller se definirá cuando se cierre el modelo jurídico y comercial.

## Propiedad intelectual

La marca, el diseño y los contenidos propios estarán protegidos conforme a la normativa aplicable. Los contenidos aportados por talleres requerirán una licencia específica.$legal$
  ),
  (
    'PRIVACY_POLICY',
    'Política de privacidad',
    'Información técnica sobre tratamientos, finalidades y derechos.',
    $legal$# Borrador técnico de política de privacidad

> Pendiente de revisión profesional y de completar la identidad del responsable.

## Responsable

- **Responsable:** [RESPONSABLE DEL TRATAMIENTO PENDIENTE]
- **NIF:** [NIF PENDIENTE]
- **Dirección:** [DIRECCIÓN PENDIENTE]
- **Contacto de privacidad:** [EMAIL DE PRIVACIDAD PENDIENTE]

## Datos y finalidades previstas

La plataforma puede tratar datos de cuenta, contacto, entrega, pedidos, mensajes, archivos aportados y registros de seguridad para gestionar talleres, publicar contenidos, tramitar pedidos piloto, atender encargos y proteger el servicio.

## Bases jurídicas y destinatarios

La ejecución contractual, las obligaciones legales, la seguridad y los consentimientos opcionales deberán concretarse por tratamiento. Cada taller recibirá únicamente los datos necesarios de sus pedidos. Alojamiento, correo, copias de seguridad, encargados y transferencias quedan pendientes de identificar.

## Derechos

Se habilitará un canal para acceso, rectificación, supresión, oposición, limitación, portabilidad y retirada del consentimiento, además de informar sobre la Agencia Española de Protección de Datos.$legal$
  ),
  (
    'COOKIE_POLICY',
    'Política de cookies y almacenamiento',
    'Categorías técnicas y preferencias opcionales de la aplicación.',
    $legal$# Borrador técnico de política de cookies y almacenamiento

> Pendiente de revisión profesional. Actualmente no hay analítica ni publicidad conectadas.

## Uso actual

La aplicación utiliza almacenamiento necesario para sesiones privadas, seguridad, carrito piloto y preferencias de privacidad. El carrito no guarda nombre, correo, teléfono ni dirección.

## Categorías

- **Necesarias:** seguridad, sesiones y preferencias de privacidad. No pueden desactivarse.
- **Preferencias:** funciones opcionales de presentación. No hay proveedor externo conectado.
- **Analítica:** desactivada. No se carga ninguna herramienta de medición.
- **Marketing:** desactivado. No se carga publicidad comportamental.

Las categorías opcionales comienzan desactivadas. Aceptar y rechazar se presentan con la misma visibilidad y la elección puede modificarse desde el centro de privacidad.

Antes de activar cualquier servicio externo se identificará su proveedor, finalidad, duración y posibles transferencias internacionales.$legal$
  ),
  (
    'PURCHASE_TERMS',
    'Condiciones de compra',
    'Reglas del carrito piloto y formación de pedidos por taller.',
    $legal$# Borrador técnico de condiciones de compra

> Pendiente de definir vendedor contractual, fiscalidad, pagos, comisiones y facturación.

## Pedidos por taller

El piloto puede agrupar visualmente productos de varios talleres, pero genera un pedido independiente para cada proveedor. Esta regla será revisada antes de integrar pagos para decidir si cada compra debe limitarse a un solo taller.

## Información previa

Antes de contratar deberán mostrarse vendedor, características, precio total, impuestos, envío, preparación, pago y reclamaciones.

## Piloto actual

El checkout no procesa pagos. Registra pedidos de prueba, reserva existencias y genera un acceso privado para comprobar el flujo.

## Personalizaciones

Las opciones y especificaciones elegidas forman parte del pedido. Los diseños propios pueden requerir conversación, presupuesto y aprobación posterior del cliente.

La plataforma deberá enviar una confirmación duradera y conservar la versión exacta de las condiciones aceptadas.$legal$
  ),
  (
    'SHIPPING_RETURNS',
    'Envíos, devoluciones y desistimiento',
    'Preparación, entrega, incidencias, devoluciones y garantías.',
    $legal$# Borrador técnico de envíos, devoluciones y desistimiento

> Pendiente de completar transportistas, costes, territorios, dirección de devolución y responsable contractual.

Cada ficha indicará el plazo estimado de preparación. Los pedidos de talleres distintos podrán tener seguimientos y entregas independientes.

Cliente y taller podrán registrar retrasos, daños, errores de artículo o personalización. La solución podrá incluir reparación, sustitución, devolución o reembolso según las condiciones definitivas y la normativa aplicable.

Las condiciones explicarán el plazo y forma de desistimiento, los costes de devolución y el modelo correspondiente cuando exista este derecho.

Los bienes confeccionados según especificaciones o claramente personalizados pueden quedar exceptuados del desistimiento, sin eliminar las garantías ni los derechos ante falta de conformidad.$legal$
  ),
  (
    'CUSTOM_PRODUCTS',
    'Productos personalizados',
    'Especificaciones, aprobación y límites de los encargos personalizados.',
    $legal$# Borrador técnico de productos personalizados

> Pendiente de revisión profesional y coordinación con las condiciones de compra.

Los textos, colores, medidas, imágenes, archivos y notas aportados por el cliente forman parte de las especificaciones. El cliente deberá comprobarlos antes de confirmar.

Un diseño propio puede abrir una conversación privada. El taller podrá solicitar información, adjuntar archivos y emitir un presupuesto. Solo el cliente podrá aprobar la versión vigente.

El inicio de la producción, los cambios posteriores y sus costes deberán comunicarse antes de la aprobación.

Los bienes claramente personalizados pueden quedar exceptuados del desistimiento, pero conservan las garantías legales. El cliente deberá disponer de derechos suficientes sobre los textos, imágenes y diseños que aporte.$legal$
  ),
  (
    'PROVIDER_AGREEMENT',
    'Acuerdo de proveedores',
    'Obligaciones de los talleres participantes en el piloto.',
    $legal$# Borrador técnico de acuerdo de proveedores

> No constituye un contrato definitivo. Pendiente de modelo comercial, fiscal y revisión profesional.

El taller facilitará datos veraces, protegerá sus credenciales y mantendrá actualizados sus miembros autorizados.

Será responsable de la exactitud de fichas, precios, existencias, preparación, materiales, advertencias y derechos sobre fotografías, vídeos y textos. Atelier Lumière podrá solicitar cambios antes de publicar.

Cada taller accederá solo a sus pedidos y a los datos necesarios para prepararlos y enviarlos. Deberá mantener estados, seguimientos e incidencias actualizados.

Vendedor contractual, facturación, impuestos, comisiones, liquidaciones y reembolsos quedan pendientes de decisión. También deberán formalizarse los roles de protección de datos, las medidas de seguridad y la gestión de brechas y derechos.$legal$
  ),
  (
    'CONTENT_LICENSE',
    'Licencia de imágenes, vídeos y textos',
    'Permisos necesarios para mostrar y promocionar contenido artesanal.',
    $legal$# Borrador técnico de licencia de contenido

> Pendiente de definir alcance territorial, duración, canales promocionales y revocación.

El taller conservará la titularidad de sus fotografías, vídeos, textos, marcas y diseños, salvo derechos de terceros.

Para operar catálogo y blog será necesaria una licencia no exclusiva que permita alojar, reproducir, adaptar técnicamente, generar miniaturas, comunicar públicamente y mostrar el contenido en los canales acordados.

El proveedor deberá confirmar que dispone de derechos y autorizaciones suficientes, incluidas las de personas identificables, música, marcas y obras de terceros.

La plataforma podrá cambiar formato, tamaño y compresión para seguridad y rendimiento sin alterar sustancialmente la obra. El procedimiento de retirada y las obligaciones de conservación deberán definirse en el acuerdo definitivo.$legal$
  )
) AS draft(document_type, title, summary, content_markdown)
ON CONFLICT (document_type, locale, version) DO NOTHING;

COMMIT;
