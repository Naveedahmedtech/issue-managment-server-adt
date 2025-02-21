/*
  Warnings:

  - You are about to drop the column `issueId` on the `File` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_issueId_fkey";

-- AlterTable
ALTER TABLE "File" DROP COLUMN "issueId";

-- AlterTable
ALTER TABLE "IssueFile" ADD COLUMN     "fileId" UUID;

-- AddForeignKey
ALTER TABLE "IssueFile" ADD CONSTRAINT "IssueFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
