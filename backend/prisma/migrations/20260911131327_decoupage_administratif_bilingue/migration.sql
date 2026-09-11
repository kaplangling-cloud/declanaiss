-- AlterTable
ALTER TABLE "arrondissements" ADD COLUMN     "codeUnique" TEXT,
ADD COLUMN     "nomEn" TEXT;

-- AlterTable
ALTER TABLE "departements" ADD COLUMN     "chefLieu" TEXT,
ADD COLUMN     "nomEn" TEXT;

-- AlterTable
ALTER TABLE "regions" ADD COLUMN     "chefLieu" TEXT,
ADD COLUMN     "nomEn" TEXT;
