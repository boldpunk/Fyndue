-- Russian interface: rename the default categories created by bootstrap.
-- Only untouched defaults (isDefault, still the original English name) are
-- renamed, and never onto a name the user already has.
UPDATE "Category" AS c
SET "name" = m.ru
FROM (VALUES
  ('EXPENSE', 'Fuel', 'Топливо'),
  ('EXPENSE', 'Taxi', 'Такси'),
  ('EXPENSE', 'Groceries', 'Продукты'),
  ('EXPENSE', 'Restaurants', 'Кафе и рестораны'),
  ('EXPENSE', 'Shopping', 'Покупки'),
  ('EXPENSE', 'Car', 'Автомобиль'),
  ('EXPENSE', 'Home', 'Дом'),
  ('EXPENSE', 'Utilities', 'Коммунальные услуги'),
  ('EXPENSE', 'Internet', 'Интернет'),
  ('EXPENSE', 'Mobile', 'Мобильная связь'),
  ('EXPENSE', 'Entertainment', 'Развлечения'),
  ('EXPENSE', 'Travel', 'Путешествия'),
  ('EXPENSE', 'Health', 'Здоровье'),
  ('EXPENSE', 'Education', 'Образование'),
  ('EXPENSE', 'Subscriptions', 'Подписки'),
  ('EXPENSE', 'Gifts', 'Подарки'),
  ('EXPENSE', 'Debt Payments', 'Платежи по долгам'),
  ('EXPENSE', 'Other', 'Другое'),
  ('INCOME', 'Salary', 'Зарплата'),
  ('INCOME', 'Freelance', 'Фриланс'),
  ('INCOME', 'Bonus', 'Премия'),
  ('INCOME', 'Cash', 'Наличные'),
  ('INCOME', 'Refund', 'Возврат'),
  ('INCOME', 'Other', 'Другое')
) AS m(type, en, ru)
WHERE c."isDefault" = true
  AND c."type"::text = m.type
  AND c."name" = m.en
  AND NOT EXISTS (
    SELECT 1 FROM "Category" AS x
    WHERE x."userId" = c."userId" AND x."type" = c."type" AND x."name" = m.ru
  );
