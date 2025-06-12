-- CreateTable
CREATE TABLE "ProjectChecklistItemLog" (
    "id" UUID NOT NULL,
    "checklistItemId" UUID NOT NULL,
    "changedField" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChecklistItemLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProjectChecklistItemLog" ADD CONSTRAINT "ProjectChecklistItemLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ProjectChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItemLog" ADD CONSTRAINT "ProjectChecklistItemLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
