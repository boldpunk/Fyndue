-- New default income category for money other people send, added to
-- existing users right after «Зарплата», unless they already have it.
INSERT INTO "Category" ("id", "userId", "name", "type", "icon", "color", "isDefault", "isSystem", "isArchived", "sortOrder", "createdAt", "updatedAt")
SELECT
  'tin_' || replace(gen_random_uuid()::text, '-', ''),
  u."id",
  'Переводы от людей',
  'INCOME',
  'hand-coins',
  'teal',
  true,
  false,
  false,
  COALESCE(
    (SELECT c."sortOrder" FROM "Category" c WHERE c."userId" = u."id" AND c."type" = 'INCOME' AND c."name" = 'Зарплата' LIMIT 1),
    0
  ),
  now(),
  now()
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Category" c WHERE c."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."userId" = u."id" AND c."type" = 'INCOME' AND c."name" = 'Переводы от людей');
