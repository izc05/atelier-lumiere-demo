BEGIN;

CREATE TABLE legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN (
    'LEGAL_NOTICE',
    'PRIVACY_POLICY',
    'COOKIE_POLICY',
    'PURCHASE_TERMS',
    'SHIPPING_RETURNS',
    'PERSONALIZED_PRODUCTS',
    'PROVIDER_AGREEMENT',
    'CONTENT_LICENSE'
  )),
  version text NOT NULL CHECK (version ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 600),
  content_md text NOT NULL CHECK (char_length(content_md) BETWEEN 100 AND 100000),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  professional_review_required boolean NOT NULL DEFAULT true,
  effective_at timestamptz,
  published_at timestamptz,
  retired_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, version),
  CHECK (status <> 'PUBLISHED' OR (
    published_at IS NOT NULL
    AND effective_at IS NOT NULL
    AND professional_review_required = false
  )),
  CHECK (status <> 'RETIRED' OR retired_at IS NOT NULL)
);

CREATE UNIQUE INDEX legal_documents_one_published_type_idx
  ON legal_documents(document_type)
  WHERE status = 'PUBLISHED';

CREATE INDEX legal_documents_status_type_idx
  ON legal_documents(status, document_type, updated_at DESC);

CREATE TABLE privacy_preference_records (
  preference_key_hash char(64) PRIMARY KEY CHECK (preference_key_hash ~ '^[a-f0-9]{64}$'),
  legal_document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  necessary boolean NOT NULL DEFAULT true CHECK (necessary = true),
  preferences boolean NOT NULL DEFAULT false,
  analytics boolean NOT NULL DEFAULT false,
  marketing boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preference_key_hash char(64) CHECK (
    preference_key_hash IS NULL OR preference_key_hash ~ '^[a-f0-9]{64}$'
  ),
  subject_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  checkout_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES providers(id) ON DELETE RESTRICT,
  legal_document_id uuid NOT NULL REFERENCES legal_documents(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'COOKIE_PREFERENCES_SAVED',
    'PRIVACY_NOTICE_ACKNOWLEDGED',
    'PURCHASE_TERMS_ACCEPTED',
    'PERSONALIZED_PRODUCT_ACKNOWLEDGED',
    'PROVIDER_AGREEMENT_ACCEPTED',
    'CONTENT_LICENSE_ACCEPTED',
    'CONSENT_WITHDRAWN'
  )),
  decision text NOT NULL CHECK (decision IN ('GRANTED', 'DENIED', 'ACKNOWLEDGED', 'WITHDRAWN')),
  categories jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(categories) = 'object'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    preference_key_hash IS NOT NULL
    OR subject_user_id IS NOT NULL
    OR checkout_id IS NOT NULL
    OR provider_id IS NOT NULL
  )
);

CREATE INDEX legal_consent_events_preference_idx
  ON legal_consent_events(preference_key_hash, occurred_at DESC)
  WHERE preference_key_hash IS NOT NULL;
CREATE INDEX legal_consent_events_user_idx
  ON legal_consent_events(subject_user_id, occurred_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX legal_consent_events_checkout_idx
  ON legal_consent_events(checkout_id, occurred_at DESC)
  WHERE checkout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.prepare_legal_document()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_sha256 := encode(digest(NEW.content_md, 'sha256'), 'hex');
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN
    IF NEW.content_md IS DISTINCT FROM OLD.content_md
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.document_type IS DISTINCT FROM OLD.document_type THEN
      RAISE EXCEPTION 'PUBLISHED_LEGAL_DOCUMENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_documents_prepare
BEFORE INSERT OR UPDATE ON legal_documents
FOR EACH ROW EXECUTE FUNCTION app.prepare_legal_document();

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

CREATE OR REPLACE FUNCTION app.protect_legal_consent_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'LEGAL_CONSENT_EVENTS_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER legal_consent_events_append_only
BEFORE UPDATE OR DELETE ON legal_consent_events
FOR EACH ROW EXECUTE FUNCTION app.protect_legal_consent_event();

ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE privacy_preference_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_preference_records FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_consent_events FORCE ROW LEVEL SECURITY;

CREATE POLICY legal_documents_admin_all ON legal_documents
  FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY privacy_preferences_admin_all ON privacy_preference_records
  FOR ALL USING (app.is_admin()) WITH CHECK (app.is_admin());
CREATE POLICY legal_consent_events_admin_select ON legal_consent_events
  FOR SELECT USING (app.is_admin());
CREATE POLICY legal_consent_events_admin_insert ON legal_consent_events
  FOR INSERT WITH CHECK (app.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON legal_documents TO atelier_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON privacy_preference_records TO atelier_app_runtime;
GRANT SELECT, INSERT ON legal_consent_events TO atelier_app_runtime;

INSERT INTO legal_documents (document_type, version, title, summary, content_md, content_sha256)
VALUES
(
  'LEGAL_NOTICE', 'draft-2026-08-03', 'Aviso legal',
  'Identificación del titular y reglas generales de uso del sitio.',
  $legal$# Borrador técnico de aviso legal

> Pendiente de revisión profesional y de completar los datos identificativos antes de abrir ventas.

## Titular del sitio

- **Titular o razón social:** [TITULAR / RAZÓN SOCIAL PENDIENTE]
- **NIF:** [NIF PENDIENTE]
- **Domicilio:** [DOMICILIO LEGAL PENDIENTE]
- **Correo de contacto legal:** [EMAIL LEGAL PENDIENTE]
- **Datos registrales, si proceden:** [REGISTRO PENDIENTE]

## Finalidad del sitio

Atelier Lumière es una plataforma técnica para presentar piezas artesanales, historias de talleres y pedidos separados por proveedor. Durante el piloto no se procesa ningún pago real.

## Condiciones de acceso y uso

La persona usuaria se compromete a utilizar el sitio de forma lícita, a no interferir en su seguridad y a no introducir contenidos que vulneren derechos de terceros. Los accesos privados son personales y no deben compartirse.

## Responsabilidad

La disponibilidad, alcance comercial, responsabilidades de la plataforma y responsabilidades de cada taller deberán definirse tras elegir el modelo jurídico y comercial definitivo.

## Propiedad intelectual

La marca, el diseño de la plataforma y los contenidos propios estarán protegidos conforme a la normativa aplicable. Las licencias aportadas por los talleres se desarrollan en el documento específico de contenido.
$legal$,
  repeat('0', 64)
),
(
  'PRIVACY_POLICY', 'draft-2026-08-03', 'Política de privacidad',
  'Información técnica sobre tratamientos, finalidades y derechos.',
  $legal$# Borrador técnico de política de privacidad

> Pendiente de revisión profesional y de completar la identidad del responsable.

## Responsable del tratamiento

- **Responsable:** [RESPONSABLE DEL TRATAMIENTO PENDIENTE]
- **NIF:** [NIF PENDIENTE]
- **Dirección:** [DIRECCIÓN PENDIENTE]
- **Contacto para privacidad:** [EMAIL DE PRIVACIDAD PENDIENTE]
- **Delegado de protección de datos, si procede:** [DPD PENDIENTE / NO APLICA]

## Datos y finalidades previstas

La plataforma puede tratar datos de cuenta, contacto, entrega, pedidos, mensajes, archivos aportados y registros de seguridad. Las finalidades previstas son gestionar talleres, publicar contenidos, tramitar pedidos piloto, atender encargos, mantener la seguridad y cumplir obligaciones legales.

## Bases jurídicas pendientes de validación

La ejecución contractual, el cumplimiento de obligaciones legales, el interés legítimo en seguridad y el consentimiento para finalidades opcionales deberán concretarse por tratamiento en el registro interno antes del lanzamiento.

## Destinatarios y encargados

Los datos necesarios de cada pedido se mostrarán únicamente al taller correspondiente. Los proveedores tecnológicos, alojamiento, correo, copias de seguridad y posibles transferencias internacionales quedan pendientes de identificar y documentar.

## Conservación

Los plazos deberán definirse por categoría de datos y obligación legal. Los enlaces y sesiones tienen caducidad técnica; los pedidos, facturación y consentimientos requerirán plazos específicos.

## Derechos

Las personas podrán solicitar acceso, rectificación, supresión, oposición, limitación y portabilidad cuando proceda, además de retirar consentimientos sin afectar al tratamiento previo. El canal y procedimiento quedan pendientes de completar.

## Reclamaciones

Se informará del derecho a reclamar ante la Agencia Española de Protección de Datos cuando se complete la identidad del responsable y el canal de ejercicio de derechos.
$legal$,
  repeat('0', 64)
),
(
  'COOKIE_POLICY', 'draft-2026-08-03', 'Política de cookies y almacenamiento',
  'Categorías técnicas y preferencias opcionales de la aplicación.',
  $legal$# Borrador técnico de política de cookies y almacenamiento

> Pendiente de revisión profesional. Actualmente no hay analítica ni publicidad conectadas.

## Uso actual

La aplicación utiliza almacenamiento estrictamente necesario para mantener sesiones privadas, proteger formularios, recordar el carrito piloto y conservar las preferencias de privacidad. El carrito no guarda nombre, correo, teléfono ni dirección.

## Categorías

- **Necesarias:** seguridad, sesiones, equilibrio de carga y preferencias de privacidad. Permanecen activas porque la aplicación no puede funcionar de forma segura sin ellas.
- **Preferencias:** funciones opcionales de presentación. No hay proveedor externo conectado actualmente.
- **Analítica:** desactivada. No se carga ninguna herramienta de medición.
- **Marketing:** desactivado. No se carga publicidad comportamental.

## Control de preferencias

Las categorías opcionales comienzan desactivadas. Cuando se ofrezcan, aceptar y rechazar deberán presentarse con la misma visibilidad. La persona podrá modificar su decisión desde el centro de privacidad.

## Terceros

Antes de activar cualquier servicio externo se añadirá su nombre, finalidad, duración, titularidad y posibles transferencias internacionales.
$legal$,
  repeat('0', 64)
),
(
  'PURCHASE_TERMS', 'draft-2026-08-03', 'Condiciones de compra',
  'Reglas del carrito multi-taller y formación de pedidos.',
  $legal$# Borrador técnico de condiciones de compra

> Pendiente de definir el vendedor contractual, fiscalidad, pagos, comisiones y facturación.

## Compra separada por taller

El carrito puede incluir artículos de varios talleres, pero genera un pedido independiente para cada proveedor. Cada taller recibe únicamente los datos y artículos de su pedido.

## Información previa

Antes de contratar deberán mostrarse identidad del vendedor, características esenciales, precio total, impuestos, gastos de envío, plazo de preparación, medios de pago y procedimiento de reclamación.

## Piloto actual

El checkout actual no procesa pagos. Registra pedidos de prueba, reserva existencias y genera un acceso privado para comprobar el flujo operativo.

## Personalizaciones

Las opciones, suplementos y especificaciones elegidas se incorporan a la línea del pedido. Los encargos de diseño propio pueden requerir presupuesto y aprobación posterior del cliente.

## Confirmación y archivo

La plataforma deberá remitir una confirmación en soporte duradero y conservar la versión de las condiciones aceptadas en el momento de la compra.
$legal$,
  repeat('0', 64)
),
(
  'SHIPPING_RETURNS', 'draft-2026-08-03', 'Envíos, devoluciones y desistimiento',
  'Preparación, entrega, incidencias y devoluciones.',
  $legal$# Borrador técnico de envíos, devoluciones y desistimiento

> Pendiente de completar transportistas, costes, territorios, dirección de devolución y responsable contractual.

## Preparación y envío

Cada ficha indica un intervalo estimado de preparación. Los pedidos se separan por taller y pueden tener seguimientos y entregas diferentes.

## Incidencias

Cliente y taller pueden registrar retrasos, daños, errores de artículo o personalización. La resolución, sustitución, reparación, devolución o reembolso dependerá de las condiciones definitivas y de la normativa aplicable.

## Desistimiento

Las condiciones deberán explicar el plazo, la forma de comunicarlo, los costes de devolución y el modelo correspondiente cuando exista derecho de desistimiento.

## Productos personalizados

La excepción aplicable a bienes confeccionados según especificaciones o claramente personalizados deberá explicarse de forma destacada antes de confirmar el pedido, sin eliminar otros derechos legales por falta de conformidad.
$legal$,
  repeat('0', 64)
),
(
  'PERSONALIZED_PRODUCTS', 'draft-2026-08-03', 'Productos personalizados',
  'Especificaciones, aprobación y límites de los encargos personalizados.',
  $legal$# Borrador técnico de productos y encargos personalizados

> Pendiente de revisión profesional y coordinación con las condiciones de compra.

## Especificaciones del cliente

Las personalizaciones seleccionadas, textos, colores, medidas, archivos y notas forman parte de las especificaciones del pedido. El cliente debe comprobarlas antes de confirmar.

## Diseño propio y presupuesto

Un encargo especial puede abrir una conversación privada. El taller podrá solicitar información, adjuntar archivos y emitir un presupuesto. Solo el cliente podrá aprobar el presupuesto vigente.

## Producción

El inicio de la producción, las posibilidades de modificación y los costes de cambios posteriores deberán quedar definidos por el taller y comunicarse antes de la aprobación.

## Desistimiento y conformidad

Los bienes confeccionados conforme a especificaciones o claramente personalizados pueden quedar exceptuados del desistimiento. Esta excepción no sustituye las garantías legales ni los derechos ante productos defectuosos o no conformes.

## Licencias de archivos

El cliente declara que puede utilizar los textos, imágenes o diseños que aporta para el encargo. El alcance y la conservación de esos archivos deberán concretarse en la política definitiva.
$legal$,
  repeat('0', 64)
),
(
  'PROVIDER_AGREEMENT', 'draft-2026-08-03', 'Acuerdo de proveedores',
  'Obligaciones de los talleres participantes en el piloto.',
  $legal$# Borrador técnico de acuerdo de proveedores

> No constituye un contrato definitivo. Pendiente de modelo comercial, fiscal y revisión profesional.

## Identificación y acceso

El taller facilitará datos veraces, mantendrá protegidas sus credenciales y comunicará cambios en sus miembros autorizados.

## Catálogo y contenido

El proveedor será responsable de la exactitud de fichas, precios, existencias, plazos, materiales, advertencias y derechos sobre fotografías, vídeos y textos. Atelier Lumière podrá solicitar cambios antes de publicar.

## Pedidos

Cada taller solo accederá a sus pedidos y a los datos necesarios para prepararlos y enviarlos. Deberá actualizar estados, seguimientos e incidencias de forma diligente.

## Fiscalidad, cobros y comisiones

El vendedor contractual, la facturación, impuestos, comisiones, liquidaciones y reembolsos quedan pendientes del Bloque 8 y de la decisión jurídica definitiva.

## Protección de datos

El reparto de roles entre plataforma y talleres, las instrucciones, medidas de seguridad, atención de derechos, brechas y conservación deberá formalizarse antes del piloto con datos reales.

## Suspensión

La plataforma podrá pausar el acceso ante riesgos de seguridad, incumplimientos, datos inexactos o contenidos que vulneren derechos.
$legal$,
  repeat('0', 64)
),
(
  'CONTENT_LICENSE', 'draft-2026-08-03', 'Licencia de imágenes, vídeos y textos',
  'Permisos necesarios para mostrar y promocionar contenido artesanal.',
  $legal$# Borrador técnico de licencia de contenido

> Pendiente de definir alcance territorial, duración, canales promocionales y revocación.

## Titularidad

El taller conserva la titularidad de sus fotografías, vídeos, textos, marcas y diseños, salvo derechos de terceros.

## Licencia para la plataforma

Para operar el catálogo y el blog será necesaria una licencia no exclusiva que permita alojar, reproducir, adaptar técnicamente, generar miniaturas, comunicar públicamente y mostrar el contenido en los canales acordados.

## Garantías del proveedor

El proveedor deberá confirmar que dispone de derechos y autorizaciones suficientes, incluidas las de personas identificables, obras de terceros, música, marcas y espacios protegidos cuando proceda.

## Transformaciones técnicas

La plataforma podrá cambiar formato, tamaño y compresión para seguridad y rendimiento, sin alterar sustancialmente la obra.

## Retirada y conservación

El procedimiento de retirada, las copias de seguridad, los contenidos asociados a pedidos y las obligaciones legales de conservación deberán concretarse en el acuerdo definitivo.
$legal$,
  repeat('0', 64)
);

COMMIT;
