-- Stage 3: promote the prototype schema to the isolated APPGOG production data model.
-- All existing APPGOG rows are preserved or explicitly transformed. No Xboard table is read or created.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TYPE "PublishStatus" ADD VALUE IF NOT EXISTS 'OFFLINE';
CREATE TYPE "ContentFormat" AS ENUM ('MARKDOWN', 'RICH_TEXT');
CREATE TYPE "CategoryScope" AS ENUM ('CONTENT', 'PRODUCT');
CREATE TYPE "AdminRole" AS ENUM ('VIEWER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK', 'AUTO');
CREATE TYPE "CampaignKind" AS ENUM ('POPUP', 'COUNTDOWN', 'BANNER');
CREATE TYPE "PluginPosition" AS ENUM ('HEAD', 'BODY_END');
CREATE TYPE "IndexJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "OutboundLinkKind" AS ENUM ('LOGIN', 'REGISTER', 'PURCHASE', 'DASHBOARD', 'TICKET', 'AFFILIATE');

-- APPGOG administrator identities are explicit and cannot be confused with Xboard users.
CREATE TABLE "AdminUser" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'VIEWER',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

INSERT INTO "AdminUser" (
  "id", "email", "displayName", "passwordHash", "role", "enabled", "createdAt", "updatedAt"
)
SELECT
  "id",
  COALESCE(lower("email"), 'disabled-' || "id" || '@invalid.local'),
  COALESCE(NULLIF("displayName", ''), 'APPGOG 管理员'),
  COALESCE(NULLIF("passwordHash", ''), '!disabled!'),
  CASE "role"::text
    WHEN 'EDITOR' THEN 'EDITOR'::"AdminRole"
    WHEN 'ADMIN' THEN 'ADMIN'::"AdminRole"
    WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"AdminRole"
    ELSE 'VIEWER'::"AdminRole"
  END,
  "enabled" AND "email" IS NOT NULL AND "passwordHash" IS NOT NULL,
  "createdAt" AT TIME ZONE 'UTC',
  "updatedAt" AT TIME ZONE 'UTC'
FROM "User";

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser" ("email");
CREATE UNIQUE INDEX "AdminUser_email_lower_key" ON "AdminUser" (lower("email"));
CREATE INDEX "AdminUser_enabled_role_idx" ON "AdminUser" ("enabled", "role");

CREATE TABLE "AdminSession" (
  "id" TEXT PRIMARY KEY,
  "adminUserId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminSession_expiry_check" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession" ("tokenHash");
CREATE INDEX "AdminSession_adminUserId_revokedAt_idx" ON "AdminSession" ("adminUserId", "revokedAt");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession" ("expiresAt");

-- Every page edit is an immutable JSON component-tree version.
CREATE TABLE "PageVersion" (
  "id" TEXT PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "layout" JSONB NOT NULL,
  "changeNote" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageVersion_version_check" CHECK ("version" > 0 AND "schemaVersion" > 0),
  CONSTRAINT "PageVersion_layout_array_check" CHECK (jsonb_typeof("layout") = 'array')
);

ALTER TABLE "Page"
  ADD COLUMN "draftVersionId" TEXT,
  ADD COLUMN "publishedVersionId" TEXT;

INSERT INTO "PageVersion" ("id", "pageId", "version", "layout", "changeNote", "createdAt")
SELECT
  'draft-' || replace(gen_random_uuid()::text, '-', ''),
  "id",
  1,
  "draftLayout",
  '由第 3 阶段迁移保留的草稿',
  "updatedAt" AT TIME ZONE 'UTC'
FROM "Page";

INSERT INTO "PageVersion" ("id", "pageId", "version", "layout", "changeNote", "createdAt")
SELECT
  'published-' || replace(gen_random_uuid()::text, '-', ''),
  "id",
  2,
  "layout",
  '由第 3 阶段迁移保留的已发布版本',
  COALESCE("publishedAt", "updatedAt") AT TIME ZONE 'UTC'
FROM "Page"
WHERE "status" = 'PUBLISHED';

UPDATE "Page" p
SET "draftVersionId" = v."id"
FROM "PageVersion" v
WHERE v."pageId" = p."id" AND v."version" = 1;

UPDATE "Page" p
SET "publishedVersionId" = v."id"
FROM "PageVersion" v
WHERE v."pageId" = p."id" AND v."version" = 2;

ALTER TABLE "Page"
  DROP COLUMN "draftLayout",
  DROP COLUMN "layout",
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(3) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
UPDATE "Page" SET "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP) WHERE "status" = 'PUBLISHED';

ALTER TABLE "PageVersion"
  ADD CONSTRAINT "PageVersion_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PageVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Page"
  ADD CONSTRAINT "Page_draftVersionId_fkey"
    FOREIGN KEY ("draftVersionId") REFERENCES "PageVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Page_publishedVersionId_fkey"
    FOREIGN KEY ("publishedVersionId") REFERENCES "PageVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Page_route_target_check" CHECK (
    ("routeType" = 'PAGE' AND "redirectUrl" IS NULL)
    OR ("routeType" = 'REDIRECT' AND "redirectUrl" IS NOT NULL AND "redirectUrl" ~* '^https?://')
  ),
  ADD CONSTRAINT "Page_publish_state_check" CHECK (
    "status" <> 'PUBLISHED'
    OR ("publishedAt" IS NOT NULL AND ("routeType" = 'REDIRECT' OR "publishedVersionId" IS NOT NULL))
  ),
  ADD CONSTRAINT "Page_slug_check" CHECK ("slug" ~* '^[a-z0-9][a-z0-9/_-]*$');

CREATE INDEX "PageVersion_pageId_createdAt_idx" ON "PageVersion" ("pageId", "createdAt");
CREATE UNIQUE INDEX "PageVersion_pageId_version_key" ON "PageVersion" ("pageId", "version");
CREATE INDEX "Page_status_updatedAt_idx" ON "Page" ("status", "updatedAt");
CREATE INDEX "Page_routeType_idx" ON "Page" ("routeType");
CREATE UNIQUE INDEX "Page_slug_lower_key" ON "Page" (lower("slug"));

CREATE FUNCTION appgog_validate_page_versions() RETURNS trigger AS $$
BEGIN
  IF NEW."draftVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PageVersion" WHERE "id" = NEW."draftVersionId" AND "pageId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'draft page version must belong to the same page';
  END IF;
  IF NEW."publishedVersionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PageVersion" WHERE "id" = NEW."publishedVersionId" AND "pageId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'published page version must belong to the same page';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Page_validate_versions"
BEFORE INSERT OR UPDATE OF "draftVersionId", "publishedVersionId" ON "Page"
FOR EACH ROW EXECUTE FUNCTION appgog_validate_page_versions();

CREATE FUNCTION appgog_reject_version_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPGOG version rows are immutable; create a new version instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PageVersion_immutable"
BEFORE UPDATE ON "PageVersion"
FOR EACH ROW EXECUTE FUNCTION appgog_reject_version_update();

-- Categorisation is scoped so CMS and independent products cannot silently share namespaces.
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";
ALTER TABLE "Category" DROP CONSTRAINT "Category_slug_key";
ALTER TABLE "Category"
  ADD COLUMN "scope" "CategoryScope" NOT NULL DEFAULT 'CONTENT',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Category" c
SET "scope" = 'PRODUCT'
WHERE EXISTS (SELECT 1 FROM "Product" p WHERE p."categoryId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "Content" d WHERE d."categoryId" = c."id");

ALTER TABLE "Category"
  ALTER COLUMN "updatedAt" DROP DEFAULT,
  ADD CONSTRAINT "Category_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Category_not_self_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  ADD CONSTRAINT "Category_slug_check" CHECK ("slug" ~* '^[a-z0-9][a-z0-9_-]*$');
CREATE UNIQUE INDEX "Category_scope_slug_key" ON "Category" ("scope", "slug");
CREATE UNIQUE INDEX "Category_scope_slug_lower_key" ON "Category" ("scope", lower("slug"));
CREATE INDEX "Category_scope_parentId_sort_idx" ON "Category" ("scope", "parentId", "sort");

CREATE FUNCTION appgog_prevent_category_cycle() RETURNS trigger AS $$
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."parentId" = NEW."id" OR EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT "id", "parentId" FROM "Category" WHERE "id" = NEW."parentId"
      UNION ALL
      SELECT c."id", c."parentId"
      FROM "Category" c
      JOIN ancestors a ON c."id" = a."parentId"
    )
    SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'category cycle is not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Category_prevent_cycle"
BEFORE INSERT OR UPDATE OF "parentId" ON "Category"
FOR EACH ROW EXECUTE FUNCTION appgog_prevent_category_cycle();

-- CMS, FAQ, video, search and RAG metadata.
ALTER TABLE "Content"
  ADD COLUMN "format" "ContentFormat" NOT NULL DEFAULT 'MARKDOWN',
  ADD COLUMN "faqQuestion" TEXT,
  ADD COLUMN "faqAnswer" TEXT,
  ADD COLUMN "ragIndexedAt" TIMESTAMPTZ(3),
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "seoKeywords" TEXT,
  ADD COLUMN "ogImage" TEXT;
UPDATE "Content" SET "faqQuestion" = "title", "faqAnswer" = "body" WHERE "type" = 'FAQ';
ALTER TABLE "Content"
  ALTER COLUMN "body" SET DEFAULT '',
  ALTER COLUMN "ragEnabled" SET DEFAULT false,
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(3) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC',
  ADD CONSTRAINT "Content_view_count_check" CHECK ("viewCount" >= 0),
  ADD CONSTRAINT "Content_faq_fields_check" CHECK (
    "type" <> 'FAQ' OR (
      "faqQuestion" IS NOT NULL AND "faqAnswer" IS NOT NULL
      AND length(trim("faqQuestion")) > 0 AND length(trim("faqAnswer")) > 0
    )
  ),
  ADD CONSTRAINT "Content_video_url_check" CHECK (
    "type" <> 'VIDEO' OR "status" <> 'PUBLISHED'
    OR ("videoUrl" IS NOT NULL AND "videoUrl" ~* '^https?://')
  ),
  ADD CONSTRAINT "Content_slug_check" CHECK ("slug" ~* '^[a-z0-9][a-z0-9/_-]*$');
UPDATE "Content" SET "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP) WHERE "status" = 'PUBLISHED';
ALTER TABLE "Content"
  ADD CONSTRAINT "Content_publish_state_check" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
ALTER TABLE "Content" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  to_tsvector('simple'::regconfig, coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("body", ''))
) STORED;
CREATE INDEX "Content_searchVector_idx" ON "Content" USING GIN ("searchVector");
CREATE UNIQUE INDEX "Content_slug_lower_key" ON "Content" (lower("slug"));
CREATE INDEX "Content_status_type_publishedAt_idx" ON "Content" ("status", "type", "publishedAt");
CREATE INDEX "Content_categoryId_status_idx" ON "Content" ("categoryId", "status");
CREATE INDEX "Content_ragEnabled_status_idx" ON "Content" ("ragEnabled", "status");

ALTER TABLE "KnowledgeChunk"
  ADD COLUMN "chunkIndex" INTEGER,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "embeddingModel" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "contentId" ORDER BY "createdAt", "id") - 1 AS position
  FROM "KnowledgeChunk"
)
UPDATE "KnowledgeChunk" k SET "chunkIndex" = ranked.position FROM ranked WHERE ranked."id" = k."id";
UPDATE "KnowledgeChunk" SET "contentHash" = md5("text");
ALTER TABLE "KnowledgeChunk"
  ALTER COLUMN "chunkIndex" SET NOT NULL,
  ALTER COLUMN "contentHash" SET NOT NULL,
  ALTER COLUMN "updatedAt" DROP DEFAULT,
  ADD CONSTRAINT "KnowledgeChunk_index_check" CHECK ("chunkIndex" >= 0),
  ADD CONSTRAINT "KnowledgeChunk_token_count_check" CHECK ("tokenCount" >= 0);
CREATE INDEX "KnowledgeChunk_contentId_idx" ON "KnowledgeChunk" ("contentId");
CREATE UNIQUE INDEX "KnowledgeChunk_contentId_chunkIndex_key" ON "KnowledgeChunk" ("contentId", "chunkIndex");

CREATE TABLE "KnowledgeIndexJob" (
  "id" TEXT PRIMARY KEY,
  "contentId" TEXT NOT NULL,
  "status" "IndexJobStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ(3),
  "finishedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "KnowledgeIndexJob_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeIndexJob_attempt_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "KnowledgeIndexJob_time_check" CHECK ("finishedAt" IS NULL OR "startedAt" IS NOT NULL)
);
CREATE INDEX "KnowledgeIndexJob_status_createdAt_idx" ON "KnowledgeIndexJob" ("status", "createdAt");
CREATE INDEX "KnowledgeIndexJob_contentId_createdAt_idx" ON "KnowledgeIndexJob" ("contentId", "createdAt");

-- Independent non-traffic catalogue only.
ALTER TABLE "Product"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "seoKeywords" TEXT,
  ADD COLUMN "ogImage" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMPTZ(3),
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
UPDATE "Product" SET "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP) WHERE "status" = 'PUBLISHED';
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_price_check" CHECK ("price" >= 0),
  ADD CONSTRAINT "Product_compare_price_check" CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" >= "price"),
  ADD CONSTRAINT "Product_inventory_check" CHECK ("stock" >= 0 AND "sales" >= 0),
  ADD CONSTRAINT "Product_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Product_gallery_array_check" CHECK (jsonb_typeof("gallery") = 'array'),
  ADD CONSTRAINT "Product_external_url_check" CHECK ("externalUrl" ~* '^https?://'),
  ADD CONSTRAINT "Product_publish_state_check" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL),
  ADD CONSTRAINT "Product_slug_check" CHECK ("slug" ~* '^[a-z0-9][a-z0-9/_-]*$');
CREATE UNIQUE INDEX "Product_sku_key" ON "Product" ("sku");
CREATE UNIQUE INDEX "Product_slug_lower_key" ON "Product" (lower("slug"));
CREATE INDEX "Product_status_publishedAt_idx" ON "Product" ("status", "publishedAt");
CREATE INDEX "Product_categoryId_status_idx" ON "Product" ("categoryId", "status");
CREATE INDEX "Product_sales_idx" ON "Product" ("sales");
CREATE INDEX "Product_price_idx" ON "Product" ("price");

-- Theme and marketing time windows use timezone-aware timestamps and database-enforced conflicts.
ALTER TABLE "Theme"
  ADD COLUMN "mode" "ThemeMode" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
WITH ranked AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt" DESC, "id") AS position
  FROM "Theme" WHERE "active" = true
)
UPDATE "Theme" t SET "active" = false FROM ranked WHERE ranked."id" = t."id" AND ranked.position > 1;
ALTER TABLE "Theme" ALTER COLUMN "updatedAt" DROP DEFAULT;
CREATE UNIQUE INDEX "Theme_name_key" ON "Theme" ("name");
CREATE INDEX "Theme_active_idx" ON "Theme" ("active");
CREATE UNIQUE INDEX "Theme_single_active_key" ON "Theme" ((true)) WHERE "active" = true;

ALTER TABLE "ThemeSchedule"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "startAt" TYPE TIMESTAMPTZ(3) USING "startAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt" TYPE TIMESTAMPTZ(3) USING "endAt" AT TIME ZONE 'UTC',
  ADD CONSTRAINT "ThemeSchedule_time_check" CHECK ("endAt" > "startAt");
ALTER TABLE "ThemeSchedule" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ThemeSchedule" ADD CONSTRAINT "ThemeSchedule_no_enabled_overlap"
  EXCLUDE USING gist (tstzrange("startAt", "endAt", '[)') WITH &&) WHERE ("enabled");
CREATE INDEX "ThemeSchedule_enabled_startAt_endAt_idx" ON "ThemeSchedule" ("enabled", "startAt", "endAt");
CREATE INDEX "ThemeSchedule_themeId_idx" ON "ThemeSchedule" ("themeId");

ALTER TABLE "MarketingCampaign"
  ADD COLUMN "kind_next" "CampaignKind" NOT NULL DEFAULT 'BANNER',
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "startAt" TYPE TIMESTAMPTZ(3) USING "startAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt" TYPE TIMESTAMPTZ(3) USING "endAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
UPDATE "MarketingCampaign"
SET "config" = CASE
  WHEN jsonb_typeof("config") = 'object' THEN "config" || jsonb_build_object('_legacyKind', "kind")
  ELSE jsonb_build_object('value', "config", '_legacyKind', "kind")
END
WHERE lower("kind") NOT IN ('popup', 'countdown', 'banner');
UPDATE "MarketingCampaign" SET "kind_next" = CASE lower("kind")
  WHEN 'popup' THEN 'POPUP'::"CampaignKind"
  WHEN 'countdown' THEN 'COUNTDOWN'::"CampaignKind"
  ELSE 'BANNER'::"CampaignKind"
END;
ALTER TABLE "MarketingCampaign"
  DROP COLUMN "kind";
ALTER TABLE "MarketingCampaign" RENAME COLUMN "kind_next" TO "kind";
ALTER TABLE "MarketingCampaign"
  ALTER COLUMN "kind" DROP DEFAULT,
  ALTER COLUMN "updatedAt" DROP DEFAULT,
  ADD CONSTRAINT "MarketingCampaign_time_check" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "endAt" > "startAt");
CREATE INDEX "MarketingCampaign_enabled_startAt_endAt_idx" ON "MarketingCampaign" ("enabled", "startAt", "endAt");

ALTER TABLE "GlobalSetting"
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
CREATE INDEX "GlobalSetting_public_idx" ON "GlobalSetting" ("public");

ALTER TABLE "PluginSnippet"
  ADD COLUMN "position_next" "PluginPosition" NOT NULL DEFAULT 'BODY_END',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PluginSnippet"
    WHERE lower(replace("position", '-', '_')) NOT IN ('head', 'body_end')
  ) THEN
    RAISE EXCEPTION 'unknown plugin position must be corrected before migration';
  END IF;
END;
$$;
UPDATE "PluginSnippet" SET "position_next" = CASE lower(replace("position", '-', '_'))
  WHEN 'head' THEN 'HEAD'::"PluginPosition"
  ELSE 'BODY_END'::"PluginPosition"
END;
ALTER TABLE "PluginSnippet"
  DROP COLUMN "position";
ALTER TABLE "PluginSnippet" RENAME COLUMN "position_next" TO "position";
ALTER TABLE "PluginSnippet"
  ALTER COLUMN "position" DROP DEFAULT,
  ADD CONSTRAINT "PluginSnippet_delay_min_check" CHECK ("delayMs" >= 3000);
CREATE UNIQUE INDEX "PluginSnippet_name_key" ON "PluginSnippet" ("name");
CREATE INDEX "PluginSnippet_enabled_position_idx" ON "PluginSnippet" ("enabled", "position");

CREATE TABLE "PluginSnippetVersion" (
  "id" TEXT PRIMARY KEY,
  "pluginSnippetId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "position" "PluginPosition" NOT NULL,
  "code" TEXT NOT NULL,
  "delayMs" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "changeNote" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PluginSnippetVersion_pluginSnippetId_fkey"
    FOREIGN KEY ("pluginSnippetId") REFERENCES "PluginSnippet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PluginSnippetVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PluginSnippetVersion_values_check" CHECK ("version" > 0 AND "delayMs" >= 3000)
);
INSERT INTO "PluginSnippetVersion" (
  "id", "pluginSnippetId", "version", "position", "code", "delayMs", "enabled", "changeNote", "createdAt"
)
SELECT
  'plugin-' || replace(gen_random_uuid()::text, '-', ''),
  "id", 1, "position", "code", "delayMs", "enabled", '由第 3 阶段迁移保留的版本', "updatedAt"
FROM "PluginSnippet";
CREATE UNIQUE INDEX "PluginSnippetVersion_pluginSnippetId_version_key"
  ON "PluginSnippetVersion" ("pluginSnippetId", "version");
CREATE INDEX "PluginSnippetVersion_pluginSnippetId_createdAt_idx"
  ON "PluginSnippetVersion" ("pluginSnippetId", "createdAt");
CREATE TRIGGER "PluginSnippetVersion_immutable"
BEFORE UPDATE ON "PluginSnippetVersion"
FOR EACH ROW EXECUTE FUNCTION appgog_reject_version_update();

CREATE TABLE "OutboundLink" (
  "id" TEXT PRIMARY KEY,
  "kind" "OutboundLinkKind" NOT NULL,
  "label" TEXT NOT NULL,
  "destinationUrl" TEXT NOT NULL,
  "openInNewWindow" BOOLEAN NOT NULL DEFAULT true,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OutboundLink_plain_url_check" CHECK (
    "destinationUrl" ~* '^https?://[^?#]+$'
  )
);
CREATE UNIQUE INDEX "OutboundLink_kind_key" ON "OutboundLink" ("kind");
CREATE INDEX "OutboundLink_enabled_idx" ON "OutboundLink" ("enabled");

-- Audit entries are append-only.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
ALTER TABLE "AuditLog"
  RENAME COLUMN "userId" TO "adminUserId";
ALTER TABLE "AuditLog"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "before" JSONB,
  ADD COLUMN "after" JSONB,
  ADD COLUMN "userAgent" TEXT,
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ADD CONSTRAINT "AuditLog_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog" ("adminUserId", "createdAt");
CREATE INDEX "AuditLog_resource_resourceId_createdAt_idx" ON "AuditLog" ("resource", "resourceId", "createdAt");
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog" ("requestId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");

CREATE FUNCTION appgog_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'APPGOG audit logs are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditLog_append_only"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION appgog_reject_audit_mutation();

DROP TABLE "User";
DROP TYPE "UserRole";

COMMIT;
