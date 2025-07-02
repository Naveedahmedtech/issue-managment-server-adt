/*
  Warnings:

  - A unique constraint covering the columns `[projectId]` on the table `ProjectChecklist` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[templateId]` on the table `ProjectChecklist` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ProjectChecklist_projectId_key" ON "ProjectChecklist"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChecklist_templateId_key" ON "ProjectChecklist"("templateId");
