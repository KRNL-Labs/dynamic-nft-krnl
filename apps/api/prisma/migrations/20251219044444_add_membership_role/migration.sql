/*
  Warnings:

  - A unique constraint covering the columns `[brandId,wallet,role]` on the table `BrandMembership` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BrandMembership" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'evolving';

-- CreateIndex
CREATE UNIQUE INDEX "BrandMembership_brandId_wallet_role_key" ON "BrandMembership"("brandId", "wallet", "role");
