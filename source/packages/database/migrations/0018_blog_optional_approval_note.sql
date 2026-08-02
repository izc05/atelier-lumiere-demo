BEGIN;

ALTER TABLE blog_post_reviews
  ALTER COLUMN reviewer_note DROP NOT NULL;

ALTER TABLE blog_post_reviews
  ADD CONSTRAINT blog_review_changes_note_required CHECK (
    status <> 'CHANGES_REQUESTED'
    OR char_length(trim(COALESCE(reviewer_note, ''))) >= 10
  );

COMMIT;
