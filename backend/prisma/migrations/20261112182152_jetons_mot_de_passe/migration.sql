-- CreateTable
CREATE TABLE "jetons_mot_de_passe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expireLe" TIMESTAMP(3) NOT NULL,
    "utiliseLe" TIMESTAMP(3),
    "revoqueLe" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jetons_mot_de_passe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jetons_mot_de_passe_tokenHash_key" ON "jetons_mot_de_passe"("tokenHash");

-- CreateIndex
CREATE INDEX "jetons_mot_de_passe_userId_idx" ON "jetons_mot_de_passe"("userId");

-- AddForeignKey
ALTER TABLE "jetons_mot_de_passe" ADD CONSTRAINT "jetons_mot_de_passe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
