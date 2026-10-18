/*
  Warnings:

  - Added the required column `action` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MessageAction" AS ENUM ('ORDER_CONFIRMED', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_DELIVERED', 'ORDER_CANCELLED');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "action" "MessageAction" NOT NULL;
