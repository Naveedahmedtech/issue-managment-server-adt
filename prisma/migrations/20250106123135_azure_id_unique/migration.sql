/*
  Warnings:

  - A unique constraint covering the columns `[azureId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Made the column `azureId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "azureId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_azureId_key" ON "User"("azureId");
