-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "url" TEXT;

-- Only web links: the value is rendered as an <a href>.
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "recurring_url_http" CHECK ("url" IS NULL OR ("url" ~* '^https?://' AND length("url") <= 300));
