-- AlterTable
ALTER TABLE "IssueHistory" ADD COLUMN     "checklistItemId" UUID,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'ISSUES',
ALTER COLUMN "issueId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "IssueHistory" ADD CONSTRAINT "IssueHistory_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ProjectChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
