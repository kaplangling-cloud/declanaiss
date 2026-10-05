/**
 * Cree un compte d'administrateur national (super-administrateur) : il cree et
 * modifie tous les comptes, centres et mairies.
 *
 *   ADMIN_EMAIL=... [ADMIN_USERNAME=...] [ADMIN_NOM=...] [ADMIN_PRENOMS=...] [ADMIN_PASSWORD=...] npm run admin:creer
 *   (image de production : node dist/prisma/creer-admin.js)
 *
 * Sans ADMIN_PASSWORD, un mot de passe aleatoire est genere et affiche une seule
 * fois. Dans tous les cas, il doit etre change a la premiere connexion.
 * La creation est journalisee dans l'audit chaine, dans la meme transaction.
 * Un compte existant n'est jamais modifie : passer par l'interface.
 */
import { ActionAudit, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { FORMAT_NOM_UTILISATEUR, MESSAGE_FORMAT_NOM_UTILISATEUR } from '../src/users/nom-utilisateur';
import { MESSAGE_MOT_DE_PASSE, defautsMotDePasse, motDePasseAleatoire } from '../src/common/mot-de-passe';

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL (adresse de connexion valide) doit etre defini');
  }
  const fourni = process.env.ADMIN_PASSWORD;
  if (fourni !== undefined && defautsMotDePasse(fourni).length) {
    throw new Error(`ADMIN_PASSWORD non conforme. ${MESSAGE_MOT_DE_PASSE} (manque : ${defautsMotDePasse(fourni).join(', ')})`);
  }
  // Genere conforme a la politique : un tirage base64 pouvait n'avoir ni chiffre ni caractere special
  const motDePasse = fourni ?? motDePasseAleatoire();
  const nomUtilisateur = process.env.ADMIN_USERNAME?.trim().toLowerCase() || null;
  if (nomUtilisateur && !FORMAT_NOM_UTILISATEUR.test(nomUtilisateur)) throw new Error(MESSAGE_FORMAT_NOM_UTILISATEUR);
  const nom = process.env.ADMIN_NOM?.trim() || 'ADMINISTRATEUR';
  const prenoms = process.env.ADMIN_PRENOMS?.trim() || 'Super';

  const prisma = new PrismaClient();
  // AuditService n'utilise que les methodes de PrismaClient : pas besoin du conteneur Nest
  const audit = new AuditService(prisma as unknown as PrismaService);
  try {
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error(`Un compte ${email} existe deja : le modifier depuis l'interface (Comptes)`);
    }
    if (nomUtilisateur && (await prisma.user.findUnique({ where: { nomUtilisateur }, select: { id: true } }))) {
      throw new Error(`Le nom d'utilisateur ${nomUtilisateur} est deja pris`);
    }
    const hash = await argon2.hash(motDePasse);
    const cree = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, nomUtilisateur, motDePasseHash: hash, nom, prenoms, role: Role.ADMIN_NATIONAL, doitChangerMotDePasse: true },
        select: { id: true, email: true, nomUtilisateur: true, role: true },
      });
      await audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.CREATION_COMPTE,
        valeursApres: { email: user.email, nomUtilisateur: user.nomUtilisateur, role: user.role, centreId: null, mairieId: null },
        metadonnees: { source: 'script creer-admin' },
      }, tx);
      return user;
    });

    console.log(`Compte cree : ${cree.email}${cree.nomUtilisateur ? ` / ${cree.nomUtilisateur}` : ''} (${cree.role})`);
    if (fourni === undefined) {
      console.log(`Mot de passe provisoire (affiche une seule fois) : ${motDePasse}`);
    }
    console.log('Changement du mot de passe exige a la premiere connexion.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
