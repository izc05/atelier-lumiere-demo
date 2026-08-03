BEGIN;

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

CREATE POLICY legal_consent_events_service_insert ON legal_consent_events
  FOR INSERT WITH CHECK (app.current_role() = 'LEGAL_SERVICE');

COMMIT;
