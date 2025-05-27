/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `ChecklistTemplate` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_name_key" ON "ChecklistTemplate"("name");
