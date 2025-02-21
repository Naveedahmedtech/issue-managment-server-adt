-- AlterTable
ALTER TABLE "File" ADD COLUMN     "issueId" UUID;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
