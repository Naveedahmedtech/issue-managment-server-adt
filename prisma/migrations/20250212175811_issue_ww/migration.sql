/*
  Warnings:

  - A unique constraint covering the columns `[issueId,fileId]` on the table `IssueFile` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "IssueFile_issueId_fileId_key" ON "IssueFile"("issueId", "fileId");
