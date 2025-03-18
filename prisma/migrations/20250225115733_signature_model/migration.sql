-- CreateTable
CREATE TABLE "OrderSignatures" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "filename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSignatures_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrderSignatures" ADD CONSTRAINT "OrderSignatures_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSignatures" ADD CONSTRAINT "OrderSignatures_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "OrderFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
