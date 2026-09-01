-- Additive migration: keep legacy rows; backfill only the previously public data.
BEGIN;
-- Refuse incompatible legacy public videos without silently deleting/unpublishing.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Content" WHERE "status"='PUBLISHED' AND "type"='VIDEO'
    AND NOT COALESCE("videoUrl" ~* '^https?://[^[:space:]]+\.m3u8([?#].*)?$', false)) THEN
    RAISE EXCEPTION 'Stage 8 preflight: published VIDEO requires m3u8; fix or explicitly offline legacy videos before retrying';
  END IF;
END $$;
ALTER TABLE "Category" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Content"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "publishedSlug" TEXT,
  ADD COLUMN "publishedSnapshot" JSONB,
  ADD COLUMN "publishedSearchText" TEXT,
  ADD COLUMN "publishedHash" VARCHAR(64);
ALTER TABLE "KnowledgeIndexJob" ADD COLUMN "contentHash" VARCHAR(64);
UPDATE "Content" SET "publishedSlug" = "slug",
  "publishedSnapshot" = jsonb_build_object(
    'type', "type", 'format', "format", 'title', "title", 'slug', "slug",
    'summary', "summary", 'body', "body", 'faqQuestion', "faqQuestion", 'faqAnswer', "faqAnswer",
    'coverUrl', "coverUrl", 'videoUrl', "videoUrl", 'categoryId', "categoryId",
    'seoTitle', "seoTitle", 'seoDescription', "seoDescription", 'seoKeywords', "seoKeywords", 'ogImage', "ogImage"
  ),
  "publishedSearchText" = concat_ws(' ', "title", "summary", "body", "faqQuestion", "faqAnswer")
WHERE "status" = 'PUBLISHED';
-- Legacy snapshots are sanitized on read, and receive a source hash on reindex.
-- Drafts may be incomplete; publication validation is performed on snapshots.
ALTER TABLE "Content" DROP CONSTRAINT "Content_faq_fields_check", DROP CONSTRAINT "Content_video_url_check";
CREATE UNIQUE INDEX "Content_publishedSlug_key" ON "Content" ("publishedSlug");
ALTER TABLE "Content" ADD CONSTRAINT "Content_revision_check" CHECK ("revision" > 0);
ALTER TABLE "Category" ADD CONSTRAINT "Category_revision_check" CHECK ("revision" > 0);
ALTER TABLE "Content" ADD CONSTRAINT "Content_public_snapshot_check" CHECK (
  "status" <> 'PUBLISHED' OR ("publishedSlug" IS NOT NULL AND "publishedSnapshot" IS NOT NULL AND jsonb_typeof("publishedSnapshot") = 'object')
);
ALTER TABLE "Content" ADD CONSTRAINT "Content_public_faq_check" CHECK (
  "status" <> 'PUBLISHED' OR "type" <> 'FAQ' OR COALESCE(
    length(trim("publishedSnapshot"->>'faqQuestion')) > 0 AND length(trim("publishedSnapshot"->>'faqAnswer')) > 0, false)
);
ALTER TABLE "Content" ADD CONSTRAINT "Content_public_video_check" CHECK (
  "status" <> 'PUBLISHED' OR "type" <> 'VIDEO' OR COALESCE(
    "publishedSnapshot"->>'videoUrl' ~* '^https?://[^[:space:]]+\.m3u8([?#].*)?$', false)
);
INSERT INTO "GlobalSetting" ("key", "value", "public", "createdAt", "updatedAt")
VALUES ('system.schemaVersion', '8'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "value"='8'::jsonb, "public"=false, "updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
