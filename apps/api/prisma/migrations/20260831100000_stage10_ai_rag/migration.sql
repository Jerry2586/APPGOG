BEGIN;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "indexProfile" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "KnowledgeIndexJob"
  ADD COLUMN "indexProfile" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "activeKey" TEXT,
  ADD COLUMN "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMPTZ(3);
-- Old synchronous workers have no recoverable lease. Retain their history.
ALTER TABLE "KnowledgeIndexJob" DROP CONSTRAINT "KnowledgeIndexJob_time_check";
UPDATE "KnowledgeIndexJob" SET "status"='FAILED',"finishedAt"=CURRENT_TIMESTAMP,
  "errorMessage"='升级前未结束的任务，请重新入队',"updatedAt"=CURRENT_TIMESTAMP
WHERE "status" IN ('PENDING','RUNNING');
CREATE UNIQUE INDEX "KnowledgeIndexJob_activeKey_key" ON "KnowledgeIndexJob"("activeKey");
CREATE INDEX "KnowledgeIndexJob_status_availableAt_idx" ON "KnowledgeIndexJob"("status","availableAt");
ALTER TABLE "KnowledgeIndexJob" ADD CONSTRAINT "KnowledgeIndexJob_time_check" CHECK (
  ("finishedAt" IS NULL OR "status" IN ('SUCCEEDED','FAILED'))
  AND ("startedAt" IS NULL OR "finishedAt" IS NULL OR "finishedAt">="startedAt")
  AND ("status" <> 'SUCCEEDED' OR ("startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL))
);
ALTER TABLE "KnowledgeIndexJob" ADD CONSTRAINT "KnowledgeIndexJob_lease_check" CHECK (
  "status" <> 'RUNNING' OR ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND "activeKey" IS NOT NULL AND "startedAt" IS NOT NULL)
);
CREATE TABLE "AiConfiguration" (
  "id" TEXT PRIMARY KEY DEFAULT 'main', "revision" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "autoIndexEnabled" BOOLEAN NOT NULL DEFAULT true,
  "globalAssistantEnabled" BOOLEAN NOT NULL DEFAULT false, "topK" INTEGER NOT NULL DEFAULT 6,
  "minimumScore" DOUBLE PRECISION NOT NULL DEFAULT 0.45, "perMinute" INTEGER NOT NULL DEFAULT 8,
  "globalPerMinute" INTEGER NOT NULL DEFAULT 60,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiConfiguration_bounds_check" CHECK ("id"='main' AND "revision">0 AND "topK" BETWEEN 1 AND 10
    AND "minimumScore" BETWEEN 0 AND 1 AND "perMinute" BETWEEN 1 AND 60 AND "globalPerMinute" BETWEEN 1 AND 600)
);
INSERT INTO "AiConfiguration" ("globalAssistantEnabled")
VALUES (COALESCE((SELECT "value" IN ('true'::jsonb,'"true"'::jsonb) FROM "GlobalSetting" WHERE "key"='ai.globalAssistant.enabled'),false));
CREATE TABLE "AiRateBucket" (
  "key" TEXT PRIMARY KEY,"count" INTEGER NOT NULL DEFAULT 0 CHECK ("count">=0),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiRateBucket_expiresAt_idx" ON "AiRateBucket"("expiresAt");
INSERT INTO "GlobalSetting" ("key","value","public","createdAt","updatedAt")
VALUES ('system.schemaVersion','10'::jsonb,false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "value"='10'::jsonb,"public"=false,"updatedAt"=CURRENT_TIMESTAMP;
COMMIT;
