/*
  Warnings:

  - You are about to drop the column `isPaid` on the `Order` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PaidStatus" AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'VERIFIED');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "isPaid",
ADD COLUMN     "cancelledById" INTEGER,
ADD COLUMN     "confirmedById" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paid" "PaidStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paidById" INTEGER;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
