-- Readable repository URLs: /{username}/{slug}. The slug follows the name (see modelSlugFromName
-- in packages/shared) and is unique per owner; /m/{id} keeps working and redirects.
ALTER TABLE models ADD COLUMN slug VARCHAR(100) CHARACTER SET ascii NULL AFTER name;

UPDATE models
   SET slug = LEFT(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9._-]+', '-')), 100);
UPDATE models SET slug = 'model' WHERE slug IS NULL OR slug = '';

-- Same name twice under one owner: the later ones get a short id suffix.
UPDATE models m
  JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id, slug ORDER BY created_at, id) AS position
          FROM models) ranked ON ranked.id = m.id
   SET m.slug = CONCAT(LEFT(m.slug, 91), '-', LEFT(m.id, 8))
 WHERE ranked.position > 1;

ALTER TABLE models
  MODIFY slug VARCHAR(100) CHARACTER SET ascii NOT NULL,
  ADD UNIQUE KEY uq_models_owner_slug (owner_id, slug);
