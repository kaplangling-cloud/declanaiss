-- AlterTable
ALTER TABLE "utilisateurs" ADD COLUMN     "nomUtilisateur" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_nomUtilisateur_key" ON "utilisateurs"("nomUtilisateur");

