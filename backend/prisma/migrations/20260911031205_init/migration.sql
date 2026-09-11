-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PERSONNEL_SANTE', 'CHEF_CENTRE', 'OFFICIER_ETAT_CIVIL', 'SECRETAIRE_MAIRIE', 'ADMIN_NATIONAL');

-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('MASCULIN', 'FEMININ');

-- CreateEnum
CREATE TYPE "ModeAccouchement" AS ENUM ('VOIE_BASSE', 'CESARIENNE');

-- CreateEnum
CREATE TYPE "TermeGrossesse" AS ENUM ('A_TERME', 'PREMATURE');

-- CreateEnum
CREATE TYPE "StatutDeclaration" AS ENUM ('BROUILLON', 'SOUMISE', 'VALIDEE', 'REJETEE', 'VERROUILLEE');

-- CreateEnum
CREATE TYPE "TypePieceJointe" AS ENUM ('CNI_PERE', 'CNI_MERE', 'ACTE_MARIAGE_PARENTS', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutRectification" AS ENUM ('DEMANDEE', 'APPROUVEE', 'APPLIQUEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "ActionAudit" AS ENUM ('CREATION', 'MODIFICATION', 'SOUMISSION', 'VALIDATION', 'REJET', 'VERROUILLAGE', 'DEVERROUILLAGE', 'RECTIFICATION', 'EDITION_ACTE', 'REIMPRESSION_ACTE', 'CONNEXION', 'DECONNEXION', 'ECHEC_CONNEXION', 'CONSULTATION', 'EXPORT', 'CREATION_COMPTE', 'DESACTIVATION_COMPTE');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departements" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arrondissements" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "departementId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arrondissements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mairies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "regionId" TEXT NOT NULL,
    "departementId" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mairies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centres" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "numeroAutorisation" TEXT NOT NULL,
    "autorisationDateDelivrance" DATE NOT NULL,
    "autorisationDateFinValidite" DATE,
    "regionId" TEXT NOT NULL,
    "departementId" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "mairieId" TEXT NOT NULL,
    "chefNom" TEXT NOT NULL,
    "chefFonction" TEXT NOT NULL,
    "chefContact" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "desactiveLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnels_sante" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "fonction" TEXT NOT NULL,
    "numeroOrdre" TEXT,
    "telephone" TEXT,
    "habilite" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnels_sante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenoms" TEXT NOT NULL,
    "telephone" TEXT,
    "role" "Role" NOT NULL,
    "centreId" TEXT,
    "mairieId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "doitChangerMotDePasse" BOOLEAN NOT NULL DEFAULT true,
    "derniereConnexion" TIMESTAMP(3),
    "tentativesEchouees" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusquA" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "desactiveLe" TIMESTAMP(3),

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familleId" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "revoqueLe" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences_declaration" (
    "id" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "dernierNumero" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequences_declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declarations" (
    "id" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "numeroDeclaration" TEXT,
    "centreId" TEXT NOT NULL,
    "mairieId" TEXT NOT NULL,
    "statut" "StatutDeclaration" NOT NULL DEFAULT 'BROUILLON',
    "version" INTEGER NOT NULL DEFAULT 1,
    "enfantNom" TEXT,
    "enfantPrenoms" TEXT,
    "enfantSexe" "Sexe",
    "enfantDateNaissance" DATE,
    "enfantHeureNaissance" TEXT,
    "modeAccouchement" "ModeAccouchement",
    "termeGrossesse" "TermeGrossesse",
    "moisGrossesse" INTEGER,
    "poidsNaissanceGrammes" INTEGER,
    "pereNom" TEXT,
    "perePrenoms" TEXT,
    "pereProfession" TEXT,
    "pereDomicile" TEXT,
    "pereNationalite" TEXT,
    "pereDateNaissance" DATE,
    "pereLieuNaissance" TEXT,
    "pereCniNumeroChiffre" TEXT,
    "pereCniNumeroIndex" TEXT,
    "pereCniDateDelivrance" DATE,
    "mereNom" TEXT,
    "merePrenoms" TEXT,
    "mereProfession" TEXT,
    "mereDomicile" TEXT,
    "mereNationalite" TEXT,
    "mereDateNaissance" DATE,
    "mereLieuNaissance" TEXT,
    "mereCniNumeroChiffre" TEXT,
    "mereCniNumeroIndex" TEXT,
    "mereCniDateDelivrance" DATE,
    "personnelAccoucheurId" TEXT,
    "declarantEstPersonnel" BOOLEAN NOT NULL DEFAULT true,
    "declarantNom" TEXT,
    "declarantPrenoms" TEXT,
    "declarantQualite" TEXT,
    "declarantContact" TEXT,
    "versionModele" INTEGER NOT NULL DEFAULT 1,
    "donneesComplementaires" JSONB,
    "qrToken" TEXT NOT NULL,
    "cleControle" TEXT,
    "dateSoumission" TIMESTAMP(3),
    "dateLimiteModification" TIMESTAMP(3),
    "dateVerrouillage" TIMESTAMP(3),
    "dateValidation" TIMESTAMP(3),
    "dateRejet" TIMESTAMP(3),
    "motifRejet" TEXT,
    "creeParId" TEXT NOT NULL,
    "soumisParId" TEXT,
    "traiteParId" TEXT,
    "saisieLe" TIMESTAMP(3),
    "synchroniseLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pieces_jointes" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "type" "TypePieceJointe" NOT NULL,
    "nomOriginal" TEXT NOT NULL,
    "cheminStockage" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "chiffre" BOOLEAN NOT NULL DEFAULT true,
    "televerseParId" TEXT,
    "supprimeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pieces_jointes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actes" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "mairieId" TEXT NOT NULL,
    "numeroActe" TEXT NOT NULL,
    "anneeRegistre" INTEGER NOT NULL,
    "dateDressage" DATE NOT NULL,
    "officierId" TEXT NOT NULL,
    "officierNomComplet" TEXT NOT NULL,
    "secretaireNomComplet" TEXT,
    "mentionMarginale" TEXT,
    "cheminPdf" TEXT,
    "pdfSha256" TEXT,
    "nbImpressions" INTEGER NOT NULL DEFAULT 0,
    "derniereImpression" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rectifications" (
    "id" TEXT NOT NULL,
    "declarationId" TEXT NOT NULL,
    "statut" "StatutRectification" NOT NULL DEFAULT 'DEMANDEE',
    "motif" TEXT NOT NULL,
    "champsCibles" TEXT[],
    "valeursAvant" JSONB,
    "valeursApres" JSONB,
    "referenceLegale" TEXT,
    "demandeParId" TEXT NOT NULL,
    "decideParId" TEXT,
    "decideLe" TIMESTAMP(3),
    "appliqueeLe" TIMESTAMP(3),
    "commentaireDecision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rectifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "action" "ActionAudit" NOT NULL,
    "declarationId" TEXT,
    "acteurId" TEXT,
    "acteurRole" "Role",
    "acteurEmail" TEXT,
    "valeursAvant" JSONB,
    "valeursApres" JSONB,
    "metadonnees" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "hashPrecedent" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "declarationId" TEXT,
    "ressource" TEXT NOT NULL,
    "champsSensibles" TEXT[],
    "motif" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "resultat" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_nom_key" ON "regions"("nom");

-- CreateIndex
CREATE INDEX "departements_regionId_idx" ON "departements"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "departements_regionId_code_key" ON "departements"("regionId", "code");

-- CreateIndex
CREATE INDEX "arrondissements_departementId_idx" ON "arrondissements"("departementId");

-- CreateIndex
CREATE UNIQUE INDEX "arrondissements_departementId_code_key" ON "arrondissements"("departementId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "mairies_code_key" ON "mairies"("code");

-- CreateIndex
CREATE INDEX "mairies_arrondissementId_idx" ON "mairies"("arrondissementId");

-- CreateIndex
CREATE UNIQUE INDEX "centres_code_key" ON "centres"("code");

-- CreateIndex
CREATE UNIQUE INDEX "centres_numeroAutorisation_key" ON "centres"("numeroAutorisation");

-- CreateIndex
CREATE INDEX "centres_mairieId_idx" ON "centres"("mairieId");

-- CreateIndex
CREATE INDEX "centres_regionId_idx" ON "centres"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "personnels_sante_userId_key" ON "personnels_sante"("userId");

-- CreateIndex
CREATE INDEX "personnels_sante_centreId_idx" ON "personnels_sante"("centreId");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE INDEX "utilisateurs_centreId_idx" ON "utilisateurs"("centreId");

-- CreateIndex
CREATE INDEX "utilisateurs_mairieId_idx" ON "utilisateurs"("mairieId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familleId_idx" ON "refresh_tokens"("familleId");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_declaration_centreId_annee_key" ON "sequences_declaration"("centreId", "annee");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_clientUuid_key" ON "declarations"("clientUuid");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_numeroDeclaration_key" ON "declarations"("numeroDeclaration");

-- CreateIndex
CREATE UNIQUE INDEX "declarations_qrToken_key" ON "declarations"("qrToken");

-- CreateIndex
CREATE INDEX "declarations_centreId_statut_idx" ON "declarations"("centreId", "statut");

-- CreateIndex
CREATE INDEX "declarations_mairieId_statut_idx" ON "declarations"("mairieId", "statut");

-- CreateIndex
CREATE INDEX "declarations_statut_dateLimiteModification_idx" ON "declarations"("statut", "dateLimiteModification");

-- CreateIndex
CREATE INDEX "declarations_enfantDateNaissance_idx" ON "declarations"("enfantDateNaissance");

-- CreateIndex
CREATE INDEX "declarations_pereCniNumeroIndex_idx" ON "declarations"("pereCniNumeroIndex");

-- CreateIndex
CREATE INDEX "declarations_mereCniNumeroIndex_idx" ON "declarations"("mereCniNumeroIndex");

-- CreateIndex
CREATE INDEX "pieces_jointes_declarationId_idx" ON "pieces_jointes"("declarationId");

-- CreateIndex
CREATE UNIQUE INDEX "actes_declarationId_key" ON "actes"("declarationId");

-- CreateIndex
CREATE UNIQUE INDEX "actes_numeroActe_key" ON "actes"("numeroActe");

-- CreateIndex
CREATE INDEX "actes_mairieId_anneeRegistre_idx" ON "actes"("mairieId", "anneeRegistre");

-- CreateIndex
CREATE INDEX "rectifications_declarationId_idx" ON "rectifications"("declarationId");

-- CreateIndex
CREATE INDEX "audit_logs_entite_entiteId_idx" ON "audit_logs"("entite", "entiteId");

-- CreateIndex
CREATE INDEX "audit_logs_declarationId_idx" ON "audit_logs"("declarationId");

-- CreateIndex
CREATE INDEX "audit_logs_acteurId_idx" ON "audit_logs"("acteurId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "access_logs_userId_createdAt_idx" ON "access_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "access_logs_declarationId_idx" ON "access_logs"("declarationId");

-- CreateIndex
CREATE INDEX "verification_logs_createdAt_idx" ON "verification_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "departements" ADD CONSTRAINT "departements_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrondissements" ADD CONSTRAINT "arrondissements_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "departements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mairies" ADD CONSTRAINT "mairies_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mairies" ADD CONSTRAINT "mairies_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "departements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mairies" ADD CONSTRAINT "mairies_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "arrondissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centres" ADD CONSTRAINT "centres_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centres" ADD CONSTRAINT "centres_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "departements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centres" ADD CONSTRAINT "centres_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "arrondissements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centres" ADD CONSTRAINT "centres_mairieId_fkey" FOREIGN KEY ("mairieId") REFERENCES "mairies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnels_sante" ADD CONSTRAINT "personnels_sante_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnels_sante" ADD CONSTRAINT "personnels_sante_userId_fkey" FOREIGN KEY ("userId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "centres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_mairieId_fkey" FOREIGN KEY ("mairieId") REFERENCES "mairies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences_declaration" ADD CONSTRAINT "sequences_declaration_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_centreId_fkey" FOREIGN KEY ("centreId") REFERENCES "centres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_mairieId_fkey" FOREIGN KEY ("mairieId") REFERENCES "mairies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_personnelAccoucheurId_fkey" FOREIGN KEY ("personnelAccoucheurId") REFERENCES "personnels_sante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_creeParId_fkey" FOREIGN KEY ("creeParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_soumisParId_fkey" FOREIGN KEY ("soumisParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_traiteParId_fkey" FOREIGN KEY ("traiteParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces_jointes" ADD CONSTRAINT "pieces_jointes_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actes" ADD CONSTRAINT "actes_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actes" ADD CONSTRAINT "actes_mairieId_fkey" FOREIGN KEY ("mairieId") REFERENCES "mairies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actes" ADD CONSTRAINT "actes_officierId_fkey" FOREIGN KEY ("officierId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_demandeParId_fkey" FOREIGN KEY ("demandeParId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rectifications" ADD CONSTRAINT "rectifications_decideParId_fkey" FOREIGN KEY ("decideParId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "utilisateurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "declarations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
