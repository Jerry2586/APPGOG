-- Stage 7: APPGOG-owned image metadata. File bytes live in the configured private media volume.

CREATE TABLE "MediaAsset" (
  "id" TEXT PRIMARY KEY,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "extension" VARCHAR(8) NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "altText" TEXT,
  "folder" TEXT NOT NULL DEFAULT 'general',
  "createdById" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MediaAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MediaAsset_byte_size_check" CHECK ("byteSize" BETWEEN 1 AND 10485760),
  CONSTRAINT "MediaAsset_mime_type_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
  CONSTRAINT "MediaAsset_extension_check" CHECK ("extension" IN ('jpg', 'png', 'gif', 'webp')),
  CONSTRAINT "MediaAsset_storage_key_check" CHECK ("storageKey" ~ '^[a-f0-9]{2}/[a-f0-9-]{36}[.](jpg|png|gif|webp)$'),
  CONSTRAINT "MediaAsset_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "MediaAsset_original_name_check" CHECK (length("originalName") BETWEEN 1 AND 255),
  CONSTRAINT "MediaAsset_folder_check" CHECK ("folder" ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  CONSTRAINT "MediaAsset_dimensions_check" CHECK (("width" IS NULL OR "width" BETWEEN 1 AND 30000) AND ("height" IS NULL OR "height" BETWEEN 1 AND 30000))
);

CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset" ("storageKey");
CREATE INDEX "MediaAsset_folder_archivedAt_createdAt_idx" ON "MediaAsset" ("folder", "archivedAt", "createdAt");
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset" ("sha256");
CREATE INDEX "MediaAsset_createdById_createdAt_idx" ON "MediaAsset" ("createdById", "createdAt");

INSERT INTO "GlobalSetting" ("key", "value", "public", "createdAt", "updatedAt")
VALUES ('system.schemaVersion', '7'::jsonb, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = '7'::jsonb, "public" = false, "updatedAt" = CURRENT_TIMESTAMP;
