/**
 * Import du decoupage administratif du Cameroun (RDC.xlsx -> JSON).
 *
 *   npx ts-node prisma/import-decoupage.ts
 *
 * Alimente les en-tetes bilingues de l'acte de naissance :
 *   REGION / REGION, DEPARTEMENT / DIVISION, ARRONDISSEMENT / SUB-DIVISION
 *
 * Le script est idempotent et non destructif :
 *   - les lignes deja presentes sont rapprochees par nom normalise (sans
 *     accent ni casse) et mises a jour avec le code officiel (R09, D50, A309) ;
 *   - aucune suppression : une entite absente du fichier est seulement
 *     signalee, jamais retiree (des declarations peuvent y etre rattachees).
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import * as path from 'path';

interface FichierDecoupage {
  source: string;
  avertissement: string;
  genereLe: string;
  regions: Array<{
    code: string;
    nom: string;
    nomEn: string;
    chefLieu: string;
    departements: Array<{
      code: string;
      nom: string;
      chefLieu: string;
      arrondissements: Array<{ code: string; nom: string; codeUnique: string }>;
    }>;
  }>;
}

/** "Extrême-Nord" et "EXTREME NORD" doivent se rapprocher. */
const cle = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Importe le decoupage dans la base ouverte par `prisma`. Idempotent. */
export async function importerDecoupage(prisma: PrismaClient) {
  const fichier = path.join(__dirname, 'data', 'decoupage-administratif.json');
  const data: FichierDecoupage = JSON.parse(readFileSync(fichier, 'utf-8'));

  console.log(`Source : ${data.source}`);
  const bilan = { regions: [0, 0], departements: [0, 0], arrondissements: [0, 0] }; // [crees, mis a jour]

  for (const r of data.regions) {
    // Rapprochement : d'abord par code officiel, sinon par nom normalise
    const existantes = await prisma.region.findMany();
    const dejaLa =
      existantes.find((e) => e.code === r.code) ?? existantes.find((e) => cle(e.nom) === cle(r.nom));

    const region = dejaLa
      ? await prisma.region.update({
          where: { id: dejaLa.id },
          data: { code: r.code, nom: r.nom, nomEn: r.nomEn, chefLieu: r.chefLieu, actif: true },
        })
      : await prisma.region.create({
          data: { code: r.code, nom: r.nom, nomEn: r.nomEn, chefLieu: r.chefLieu },
        });
    bilan.regions[dejaLa ? 1 : 0]++;

    for (const d of r.departements) {
      const deptsRegion = await prisma.departement.findMany({ where: { regionId: region.id } });
      const deptExistant =
        deptsRegion.find((e) => e.code === d.code) ?? deptsRegion.find((e) => cle(e.nom) === cle(d.nom));

      const departement = deptExistant
        ? await prisma.departement.update({
            where: { id: deptExistant.id },
            data: { code: d.code, nom: d.nom, nomEn: d.nom, chefLieu: d.chefLieu, actif: true },
          })
        : await prisma.departement.create({
            data: { regionId: region.id, code: d.code, nom: d.nom, nomEn: d.nom, chefLieu: d.chefLieu },
          });
      bilan.departements[deptExistant ? 1 : 0]++;

      const arrsDept = await prisma.arrondissement.findMany({ where: { departementId: departement.id } });
      for (const a of d.arrondissements) {
        const arrExistant =
          arrsDept.find((e) => e.code === a.code) ?? arrsDept.find((e) => cle(e.nom) === cle(a.nom));

        if (arrExistant) {
          await prisma.arrondissement.update({
            where: { id: arrExistant.id },
            data: { code: a.code, nom: a.nom, nomEn: a.nom, codeUnique: a.codeUnique, actif: true },
          });
          bilan.arrondissements[1]++;
        } else {
          await prisma.arrondissement.create({
            data: {
              departementId: departement.id,
              code: a.code,
              nom: a.nom,
              nomEn: a.nom,
              codeUnique: a.codeUnique,
            },
          });
          bilan.arrondissements[0]++;
        }
      }
    }
  }

  // Entites en base absentes du fichier : signalees, jamais supprimees
  const codesFichier = new Set(
    data.regions.flatMap((r) => r.departements.flatMap((d) => d.arrondissements.map((a) => a.codeUnique))),
  );
  const orphelins = (await prisma.arrondissement.findMany({ select: { nom: true, codeUnique: true } })).filter(
    (a) => !a.codeUnique || !codesFichier.has(a.codeUnique),
  );

  console.log(
    `Regions        : ${bilan.regions[0]} creees, ${bilan.regions[1]} mises a jour\n` +
      `Departements   : ${bilan.departements[0]} crees, ${bilan.departements[1]} mis a jour\n` +
      `Arrondissements: ${bilan.arrondissements[0]} crees, ${bilan.arrondissements[1]} mis a jour`,
  );
  if (orphelins.length) {
    console.warn(`${orphelins.length} arrondissement(s) hors fichier, conserves : ${orphelins.map((o) => o.nom).join(', ')}`);
  }
  console.warn(`Avertissement : ${data.avertissement}`);
}

// Execution directe : npx ts-node prisma/import-decoupage.ts
if (require.main === module) {
  const prisma = new PrismaClient();
  importerDecoupage(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
