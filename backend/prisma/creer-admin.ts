/**
 * Cree un compte d'administrateur national (super-administrateur) : il cree et
 * modifie tous les comptes, centres et mairies.
 *
 *   ADMIN_EMAIL=... [ADMIN_NOM=...] [ADMIN_PRENOMS=...] [ADMIN_PASSWORD=...] npm run admin:creer
 *   (image de production : node dist/prisma/creer-admin.js)
 *
 * Sans ADMIN_PASSWORD, un mot de passe aleatoire est genere et affiche une seule
 * fois. Dans tous les cas, il doit etre change a la premiere connexion.
 * La creation est journalisee dans l'audit chaine, dans la meme transaction.
 * Un compte existant n'est jamais modifie : passer par l'interface.
 */
import { ActionAudit, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

const LONGUEUR_MIN = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL (adresse de connexion valide) doit etre defini');
  }
  const fourni = process.env.ADMIN_PASSWORD;
  if (fourni !== undefined && fourni.length < LONGUEUR_MIN) {
    throw new Error(`ADMIN_PASSWORD doit comporter au moins ${LONGUEUR_MIN} caracteres`);
  }
  const motDePasse = fourni ?? randomBytes(15).toString('base64url'); // 20 caracteres
  const nom = process.env.ADMIN_NOM?.trim() || 'ADMINISTRATEUR';
  const prenoms = process.env.ADMIN_PRENOMS?.trim() || 'Super';

  const prisma = new PrismaClient();
  // AuditService n'utilise que les methodes de PrismaClient : pas besoin du conteneur Nest
  const audit = new AuditService(prisma as unknown as PrismaService);
  try {
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error(`Un compte ${email} existe deja : le modifier depuis l'interface (Comptes)`);
    }
    const hash = await argon2.hash(motDePasse);
    const cree = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, motDePasseHash: hash, nom, prenoms, role: Role.ADMIN_NATIONAL, doitChangerMotDePasse: true },
        select: { id: true, email: true, role: true },
      });
      await audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.CREATION_COMPTE,
        valeursApres: { email: user.email, role: user.role, centreId: null, mairieId: null },
        metadonnees: { source: 'script creer-admin' },
      }, tx);
      return user;
    });

    console.log(`Compte cree : ${cree.email} (${cree.role})`);
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
