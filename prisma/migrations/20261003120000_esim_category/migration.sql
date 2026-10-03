-- New default expense category for travel eSIMs, added to existing users
-- right after «Мобильная связь» (or at the end), unless they already have it.
INSERT INTO "Category" ("id", "userId", "name", "type", "icon", "color", "isDefault", "isSystem", "isArchived", "sortOrder", "createdAt", "updatedAt")
SELECT
  'esim_' || replace(gen_random_uuid()::text, '-', ''),
  u."id",
  'eSIM и роуминг',
  'EXPENSE',
  'sim-card',
  'sky',
  true,
  false,
  false,
  COALESCE(
    (SELECT c."sortOrder" FROM "Category" c WHERE c."userId" = u."id" AND c."type" = 'EXPENSE' AND c."name" = 'Мобильная связь' LIMIT 1),
    (SELECT MAX(c."sortOrder") FROM "Category" c WHERE c."userId" = u."id" AND c."type" = 'EXPENSE'),
    0
  ),
  now(),
  now()
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Category" c WHERE c."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."userId" = u."id" AND c."type" = 'EXPENSE' AND c."name" = 'eSIM и роуминг');
