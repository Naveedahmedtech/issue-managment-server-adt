-- AlterTable
ALTER TABLE "IssueFile" ADD COLUMN     "projectId" UUID;

-- AddForeignKey
ALTER TABLE "IssueFile" ADD CONSTRAINT "IssueFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
