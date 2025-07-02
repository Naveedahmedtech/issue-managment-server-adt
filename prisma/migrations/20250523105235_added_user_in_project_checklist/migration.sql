/*
  Warnings:

  - Added the required column `userId` to the `ProjectChecklist` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProjectChecklist" ADD COLUMN     "userId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
