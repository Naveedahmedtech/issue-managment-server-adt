/*
  Warnings:

  - A unique constraint covering the columns `[projectId,templateId]` on the table `ProjectChecklist` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ProjectChecklist_projectId_key";

-- DropIndex
DROP INDEX "ProjectChecklist_templateId_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChecklist_projectId_templateId_key" ON "ProjectChecklist"("projectId", "templateId");
