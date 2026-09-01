-- Preserve existing themes, schedules, campaign data and immutable plugin history.
ALTER TABLE "Theme" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0);
ALTER TABLE "ThemeSchedule" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0), ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE "MarketingCampaign" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0), ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE "PluginSnippet" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0);
UPDATE "PluginSnippet" p SET "revision" = GREATEST(1, COALESCE((SELECT MAX("version") FROM "PluginSnippetVersion" v WHERE v."pluginSnippetId" = p."id"), 0));
CREATE TABLE "ThemeState" (
  "id" TEXT PRIMARY KEY DEFAULT 'main' CHECK ("id" = 'main'),
  "defaultThemeId" TEXT REFERENCES "Theme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
INSERT INTO "ThemeState" ("id", "defaultThemeId", "updatedAt") VALUES ('main', (SELECT "id" FROM "Theme" WHERE "active" = true LIMIT 1), CURRENT_TIMESTAMP);
-- Existing exclusion [start,end) and unique-active constraints remain authoritative.
-- Preserve legacy code but require a review before execution by the new lifecycle.
INSERT INTO "AuditLog" ("id", "action", "resource", "resourceId", "detail", "createdAt")
SELECT 'stage11-plugin-' || "id", 'PLUGIN_MIGRATION_DISABLED', 'pluginSnippet', "id", '{"reason":"review before stage11 activation"}'::jsonb, CURRENT_TIMESTAMP FROM "PluginSnippet" WHERE "enabled" = true;
WITH disabled AS (
  UPDATE "PluginSnippet" SET "enabled" = false, "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "enabled" = true RETURNING *
)
INSERT INTO "PluginSnippetVersion" ("id", "pluginSnippetId", "version", "position", "code", "delayMs", "enabled", "changeNote", "createdAt")
SELECT 'stage11-review-' || "id", "id", "revision", "position", "code", "delayMs", false, '第十一阶段迁移：保留代码，停用等待复核', CURRENT_TIMESTAMP FROM disabled;
