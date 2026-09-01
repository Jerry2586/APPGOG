BEGIN;
CREATE TYPE "ProductKind" AS ENUM ('ACCOUNT', 'SERVICE', 'DEVICE', 'OTHER');
ALTER TABLE "Product"
  ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "publishedSlug" TEXT,
  ADD COLUMN "publishedSnapshot" JSONB,
  ADD COLUMN "publishedPrice" DECIMAL(12,2),
  ADD COLUMN "publishedSales" INTEGER;
UPDATE "Product" SET "publishedSlug"="slug", "publishedPrice"="price", "publishedSales"="sales",
  "publishedSnapshot"=jsonb_build_object('kind',"kind",'sku',"sku",'name',"name",'slug',"slug",'summary',"summary",
    'description',"description",'currency',"currency",'price',"price"::text,'compareAtPrice',"compareAtPrice"::text,
    'stock',"stock",'sales',"sales",'coverUrl',"coverUrl",'gallery',"gallery",'externalUrl',"externalUrl",
    'categoryId',"categoryId",'seoTitle',"seoTitle",'seoDescription',"seoDescription",'seoKeywords',"seoKeywords",'ogImage',"ogImage")
WHERE "status"='PUBLISHED';
-- Incomplete drafts may omit the purchase link; public snapshots may not.
ALTER TABLE "Product" DROP CONSTRAINT "Product_external_url_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_external_url_check" CHECK ("externalUrl"='' OR "externalUrl" ~* '^https?://');
ALTER TABLE "Product" ADD CONSTRAINT "Product_revision_check" CHECK ("revision">0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_public_snapshot_check" CHECK (
  "status" <> 'PUBLISHED' OR ("publishedSlug" IS NOT NULL AND "publishedSnapshot" IS NOT NULL
    AND jsonb_typeof("publishedSnapshot")='object' AND "publishedPrice" IS NOT NULL AND "publishedPrice">=0
    AND "publishedSales" IS NOT NULL AND "publishedSales">=0
    AND COALESCE("publishedSnapshot"->>'externalUrl' ~* '^https?://',false))
);
CREATE UNIQUE INDEX "Product_publishedSlug_key" ON "Product"("publishedSlug");
CREATE INDEX "Product_status_publishedPrice_idx" ON "Product"("status","publishedPrice");
CREATE INDEX "Product_status_publishedSales_idx" ON "Product"("status","publishedSales");
INSERT INTO "GlobalSetting" ("key","value","public","createdAt","updatedAt")
VALUES ('system.schemaVersion','9'::jsonb,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "value"='9'::jsonb,"public"=false,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
