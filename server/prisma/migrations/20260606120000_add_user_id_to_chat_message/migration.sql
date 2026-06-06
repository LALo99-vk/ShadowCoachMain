-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "userId" TEXT;

-- Backfill userId from the owning session
UPDATE "ChatMessage"
SET "userId" = "Session"."userId"
FROM "Session"
WHERE "ChatMessage"."sessionId" = "Session"."id";

-- Make userId required
ALTER TABLE "ChatMessage" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
