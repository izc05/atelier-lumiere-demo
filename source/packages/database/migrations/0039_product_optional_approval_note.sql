BEGIN;

ALTER TABLE product_reviews
  ALTER COLUMN reviewer_note DROP NOT NULL;

ALTER TABLE product_reviews
  ADD CONSTRAINT product_review_changes_note_required CHECK (
    status <> 'CHANGES_REQUESTED'
    OR char_length(trim(COALESCE(reviewer_note, ''))) >= 10
  );

COMMIT;
