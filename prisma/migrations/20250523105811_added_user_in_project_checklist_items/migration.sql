/*
  Warnings:

  - Added the required column `userId` to the `ProjectChecklistItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ProjectChecklist" DROP CONSTRAINT "ProjectChecklist_userId_fkey";

-- AlterTable
ALTER TABLE "ProjectChecklist" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProjectChecklistItem" ADD COLUMN     "userId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
