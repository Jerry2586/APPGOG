-- Stage 4: revocable administrator sessions and privacy-preserving login throttling.

ALTER TABLE "AdminSession"
  ADD COLUMN "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "AdminLoginAttempt" (
  "keyHash" TEXT PRIMARY KEY,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  "blockedUntil" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AdminLoginAttempt_failure_count_check" CHECK ("failureCount" >= 0),
  CONSTRAINT "AdminLoginAttempt_block_time_check" CHECK (
    "blockedUntil" IS NULL OR "blockedUntil" >= "windowStartedAt"
  )
);

CREATE INDEX "AdminLoginAttempt_blockedUntil_idx" ON "AdminLoginAttempt" ("blockedUntil");
CREATE INDEX "AdminLoginAttempt_updatedAt_idx" ON "AdminLoginAttempt" ("updatedAt");
