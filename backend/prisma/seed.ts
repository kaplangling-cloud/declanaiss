/**
 * Seed de developpement : referentiel geographique minimal, une mairie, un
 * centre de sante, du personnel habilite et un compte par role.
 *
 * Les mots de passe initiaux sont lus depuis l'environnement (SEED_PASSWORD)
 * et forcent un changement a la premiere connexion. Jamais de secret en dur.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { importerDecoupage } from './import-decoupage';
import { MESSAGE_MOT_DE_PASSE, defautsMotDePasse } from '../src/common/mot-de-passe';
import { codeCentreEtatCivil, nomCentreEtatCivil } from '../src/common/referentiel/code-etat-civil';

const prisma = new PrismaClient();

async function main() {
  const motDePasse = process.env.SEED_PASSWORD;
  if (!motDePasse || defautsMotDePasse(motDePasse).length) {
    throw new Error(`SEED_PASSWORD doit etre defini et conforme. ${MESSAGE_MOT_DE_PASSE}`);
  }
  const hash = await argon2.hash(motDePasse);

  // --- Referentiel : decoupage administratif officiel (10 regions, 58
  // departements, 360 arrondissements) importe depuis RDC.xlsx.
  await importerDecoupage(prisma);

  // Circonscriptions du jeu de demonstration, par code officiel
  const sud = await prisma.region.findUniqueOrThrow({ where: { code: 'R09' } });
  const mvila = await prisma.departement.findFirstOrThrow({ where: { regionId: sud.id, code: 'D50' } });
  const ebolowa1 = await prisma.arrondissement.findFirstOrThrow({
    where: { departementId: mvila.id, code: 'A309' },
  });

  // Un centre d'etat civil par arrondissement, code derive du referentiel (RDC.xlsx)
  const mairie =
    (await prisma.mairie.findFirst({ where: { arrondissementId: ebolowa1.id } })) ??
    (await prisma.mairie.create({
      data: {
        code: codeCentreEtatCivil(sud.code, mvila.code, ebolowa1.code), nom: nomCentreEtatCivil(ebolowa1.nom),
        adresse: 'Ebolowa, Sud', regionId: sud.id, departementId: mvila.id, arrondissementId: ebolowa1.id,
      },
    }));

  const centre = await prisma.centre.upsert({
    where: { code: 'HREBO' },
    update: {},
    create: {
      code: 'HREBO', nom: "Hopital Regional d'Ebolowa", adresse: 'Quartier administratif, Ebolowa',
      numeroAutorisation: 'AUT-SU-2020-0042', autorisationDateDelivrance: new Date('2020-03-15'), autorisationDateFinValidite: new Date('2030-03-14'),
      regionId: sud.id, departementId: mvila.id, arrondissementId: ebolowa1.id, mairieId: mairie.id,
      chefNom: 'Dr MBALLA Jean', chefFonction: 'Directeur', chefContact: '+237 6XX XX XX XX',
    },
  });

  const comptes: Array<{ email: string; role: Role; nom: string; prenoms: string; centreId?: string; mairieId?: string }> = [
    { email: 'admin@declanaiss.local', role: Role.ADMIN_NATIONAL, nom: 'ADMIN', prenoms: 'National' },
    { email: 'chef.hrebo@declanaiss.local', role: Role.CHEF_CENTRE, nom: 'MBALLA', prenoms: 'Jean', centreId: centre.id },
    { email: 'sagefemme.hrebo@declanaiss.local', role: Role.PERSONNEL_SANTE, nom: 'NGO', prenoms: 'Pauline', centreId: centre.id },
    { email: 'officier.ebo1@declanaiss.local', role: Role.OFFICIER_ETAT_CIVIL, nom: 'NKOLO', prenoms: 'Aline', mairieId: mairie.id },
    { email: 'secretaire.ebo1@declanaiss.local', role: Role.SECRETAIRE_MAIRIE, nom: 'ESSOMBA', prenoms: 'Marc', mairieId: mairie.id },
  ];
  for (const c of comptes) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: { ...c, motDePasseHash: hash, doitChangerMotDePasse: true },
    });
  }

  const sageFemme = await prisma.user.findUniqueOrThrow({ where: { email: 'sagefemme.hrebo@declanaiss.local' } });
  const personnels = [
    { nom: 'NGO', prenoms: 'Pauline', fonction: 'Sage-femme', numeroOrdre: 'SF-2018-0311', userId: sageFemme.id },
    { nom: 'ATANGANA', prenoms: 'Pierre', fonction: 'Medecin gynecologue', numeroOrdre: 'ONMC-11234' },
    { nom: 'BILOA', prenoms: 'Rose', fonction: 'Infirmiere accoucheuse' },
  ];
  for (const p of personnels) {
    const existe = await prisma.personnelSante.findFirst({ where: { centreId: centre.id, nom: p.nom, prenoms: p.prenoms } });
    if (!existe) await prisma.personnelSante.create({ data: { ...p, centreId: centre.id } });
  }

  console.log('Seed termine. Comptes :', comptes.map((c) => `${c.email} (${c.role})`).join(', '));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
