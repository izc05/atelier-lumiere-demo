BEGIN;

DROP TRIGGER product_media_00_retain_publication ON product_media;

CREATE TRIGGER product_media_zz_retain_publication
BEFORE UPDATE ON product_media
FOR EACH ROW EXECUTE FUNCTION app.retain_published_media_file();

COMMIT;
