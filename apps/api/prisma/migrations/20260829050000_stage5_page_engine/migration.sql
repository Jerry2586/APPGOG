-- Stage 5: concurrency-safe immutable page versions and restoration provenance.

ALTER TABLE "Page" ADD COLUMN "nextVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Page" p
SET "nextVersion" = COALESCE((
  SELECT MAX(v."version") + 1 FROM "PageVersion" v WHERE v."pageId" = p."id"
), 1);

ALTER TABLE "Page"
  ADD CONSTRAINT "Page_next_version_check" CHECK ("nextVersion" > 0);

ALTER TABLE "PageVersion" ADD COLUMN "restoredFromId" TEXT;
ALTER TABLE "PageVersion"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "routeType" "RouteType",
  ADD COLUMN "redirectUrl" TEXT,
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "seoKeywords" TEXT,
  ADD COLUMN "ogImage" TEXT;

ALTER TABLE "PageVersion" DISABLE TRIGGER "PageVersion_immutable";
UPDATE "PageVersion" v
SET
  "name" = p."name",
  "slug" = lower(p."slug"),
  "routeType" = p."routeType",
  "redirectUrl" = p."redirectUrl",
  "seoTitle" = p."seoTitle",
  "seoDescription" = p."seoDescription",
  "seoKeywords" = p."seoKeywords",
  "ogImage" = p."ogImage"
FROM "Page" p WHERE p."id" = v."pageId";
ALTER TABLE "PageVersion" ENABLE TRIGGER "PageVersion_immutable";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "PageVersion"
    WHERE "slug" <> lower("slug") OR "slug" LIKE '%//%'
      OR "slug" ~ '^(admin|api|content)(/|$)'
      OR ("routeType" = 'REDIRECT' AND (
        "redirectUrl" IS NULL OR "redirectUrl" !~* '^https?://[^?#]+$'
        OR "redirectUrl" ~* '^https?://[^/]*@'
      ))
  ) THEN
    RAISE EXCEPTION 'existing page routes must be canonical and redirect URLs must be plain HTTP/HTTPS URLs';
  END IF;
END;
$$;

ALTER TABLE "PageVersion"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "slug" SET NOT NULL,
  ALTER COLUMN "routeType" SET NOT NULL,
  ADD CONSTRAINT "PageVersion_route_target_check" CHECK (
    ("routeType" = 'PAGE' AND "redirectUrl" IS NULL)
    OR ("routeType" = 'REDIRECT' AND "redirectUrl" IS NOT NULL
      AND "redirectUrl" ~* '^https?://[^?#]+$' AND "redirectUrl" !~* '^https?://[^/]*@')
  ),
  ADD CONSTRAINT "PageVersion_slug_check" CHECK (
    "slug" = lower("slug")
    AND length("slug") BETWEEN 1 AND 200
    AND ("slug" ~ '^[a-z0-9][a-z0-9/_-]*[a-z0-9_-]$' OR "slug" ~ '^[a-z0-9]$')
    AND "slug" NOT LIKE '%//%'
    AND "slug" !~ '^(admin|api|content)(/|$)'
  );
CREATE INDEX "PageVersion_restoredFromId_idx" ON "PageVersion" ("restoredFromId");
CREATE INDEX "PageVersion_slug_idx" ON "PageVersion" ("slug");

CREATE TABLE "PublishedPageRoute" (
  "slug" TEXT PRIMARY KEY,
  "pageId" TEXT NOT NULL,
  "pageVersionId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PublishedPageRoute_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PublishedPageRoute_pageVersionId_fkey"
    FOREIGN KEY ("pageVersionId") REFERENCES "PageVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublishedPageRoute_pageId_key" ON "PublishedPageRoute" ("pageId");
CREATE UNIQUE INDEX "PublishedPageRoute_pageVersionId_key" ON "PublishedPageRoute" ("pageVersionId");
CREATE INDEX "PublishedPageRoute_updatedAt_idx" ON "PublishedPageRoute" ("updatedAt");

INSERT INTO "PublishedPageRoute" ("slug", "pageId", "pageVersionId", "updatedAt")
SELECT lower("slug"), "id", "publishedVersionId", CURRENT_TIMESTAMP
FROM "Page"
WHERE "status" = 'PUBLISHED' AND "publishedVersionId" IS NOT NULL;

CREATE FUNCTION appgog_validate_published_page_route() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PageVersion"
    WHERE "id" = NEW."pageVersionId" AND "pageId" = NEW."pageId" AND "slug" = NEW."slug"
  ) OR NOT EXISTS (
    SELECT 1 FROM "Page" WHERE "id" = NEW."pageId" AND "status" = 'PUBLISHED'
  ) THEN
    RAISE EXCEPTION 'published route must belong to a published page/version and use the same slug';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "PublishedPageRoute_validate"
BEFORE INSERT OR UPDATE ON "PublishedPageRoute"
FOR EACH ROW EXECUTE FUNCTION appgog_validate_published_page_route();

CREATE FUNCTION appgog_remove_inactive_page_route() RETURNS trigger AS $$
BEGIN
  IF NEW."status" <> 'PUBLISHED' THEN
    DELETE FROM "PublishedPageRoute" WHERE "pageId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Page_remove_inactive_route"
AFTER UPDATE OF "status" ON "Page"
FOR EACH ROW EXECUTE FUNCTION appgog_remove_inactive_page_route();

-- Prevent malformed or non-canonical page routes even if an application check is bypassed.
UPDATE "Page" SET "slug" = lower("slug");
ALTER TABLE "Page" DROP CONSTRAINT "Page_slug_check";
ALTER TABLE "Page" DROP CONSTRAINT "Page_route_target_check";
ALTER TABLE "Page" ADD CONSTRAINT "Page_slug_check" CHECK (
  "slug" = lower("slug")
  AND length("slug") BETWEEN 1 AND 200
  AND ("slug" ~ '^[a-z0-9][a-z0-9/_-]*[a-z0-9_-]$' OR "slug" ~ '^[a-z0-9]$')
  AND "slug" NOT LIKE '%//%'
  AND "slug" NOT LIKE 'admin/%' AND "slug" <> 'admin'
  AND "slug" NOT LIKE 'api/%' AND "slug" <> 'api'
  AND "slug" NOT LIKE 'content/%' AND "slug" <> 'content'
), ADD CONSTRAINT "Page_route_target_check" CHECK (
  ("routeType" = 'PAGE' AND "redirectUrl" IS NULL)
  OR ("routeType" = 'REDIRECT' AND "redirectUrl" IS NOT NULL
    AND "redirectUrl" ~* '^https?://[^?#]+$' AND "redirectUrl" !~* '^https?://[^/]*@')
);
