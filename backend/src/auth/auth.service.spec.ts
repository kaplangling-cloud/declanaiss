import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { MailService } from '../common/services/mail.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete } from '../common/decorators';
import { AuthService } from './auth.service';

const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'POST /auth/login' };
const MOT_DE_PASSE = 'MotDePasseDeTest2026';

const nouveauCrypto = () =>
  new CryptoService({ get: () => 'ZGV2LWRldi1kZXYtZGV2LWRldi1kZXYtZGV2LWRldi0xMg==' } as unknown as ConfigService);

const CONFIG = {
  get: (k: string) =>
    ({
      'jwt.accessSecret': 'a'.repeat(32), 'jwt.refreshSecret': 'r'.repeat(32),
      'jwt.accessTtl': '15m', 'jwt.refreshTtl': '7d',
      publicUrl: 'https://exemple.test',
    })[k],
};

describe('AuthService.login - identifiant', () => {
  let hash: string;
  beforeAll(async () => { hash = await argon2.hash(MOT_DE_PASSE); });

  const monter = () => {
    const compte = {
      id: 'u-1', email: 'rose.ngo@exemple.cm', nomUtilisateur: 'r.ngo', motDePasseHash: hash, nom: 'NGO', prenoms: 'Rose',
      role: Role.PERSONNEL_SANTE, centreId: 'c-1', mairieId: null, actif: true, doitChangerMotDePasse: false,
      tentativesEchouees: 0, bloqueJusquA: null, centre: null, mairie: null,
    };
    const recherches: Array<Record<string, string>> = [];
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: Record<string, string> }) => {
          recherches.push(where);
          return (where.email && where.email === compte.email) || (where.nomUtilisateur && where.nomUtilisateur === compte.nomUtilisateur) ? compte : null;
        },
        update: async () => compte,
      },
      refreshToken: { create: async () => ({}) },
    };
    const audit = { journaliser: jest.fn(async () => undefined) };
    const mail = { estConfigure: true, envoyerReinitialisation: jest.fn(async () => true) };
    const service = new AuthService(
      prisma as unknown as PrismaService, new JwtService({}), CONFIG as unknown as ConfigService,
      nouveauCrypto(), audit as unknown as AuditService, mail as unknown as MailService,
    );
    return { service, recherches, audit };
  };

  it("se connecte avec le nom d'utilisateur, sans tenir compte de la casse ni des espaces", async () => {
    const { service, recherches } = monter();
    const r = await service.login('  R.Ngo ', MOT_DE_PASSE, ctx);
    expect(r.utilisateur.email).toBe('rose.ngo@exemple.cm');
    expect(recherches[0]).toEqual({ nomUtilisateur: 'r.ngo' });
  });

  it("se connecte toujours avec l'adresse e-mail", async () => {
    const { service, recherches } = monter();
    await service.login('Rose.Ngo@Exemple.cm', MOT_DE_PASSE, ctx);
    expect(recherches[0]).toEqual({ email: 'rose.ngo@exemple.cm' });
  });

  it('repond de la meme facon a un identifiant inconnu, sans reveler lequel des deux champs', async () => {
    const { service, audit } = monter();
    await expect(service.login('inconnu', MOT_DE_PASSE, ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(audit.journaliser).toHaveBeenCalledWith(expect.objectContaining({ metadonnees: expect.objectContaining({ identifiant: 'inconnu', raison: 'compte inconnu' }) }));
  });
});

// ---------------------------------------------------------------------------
// Reinitialisation du mot de passe par courriel
// ---------------------------------------------------------------------------

interface JetonEnregistre {
  id: string; userId: string; tokenHash: string; expireLe: Date; createdAt: Date;
  utiliseLe: Date | null; revoqueLe: Date | null;
}

/**
 * Prisma simule : les jetons vivent dans un tableau, ce qui permet de verifier
 * ce qui est reellement ecrit (empreinte et non jeton en clair, revocations).
 */
const monterReinit = (options: { actif?: boolean; existe?: boolean; mailConfigure?: boolean } = {}) => {
  const { actif = true, existe = true, mailConfigure = true } = options;
  const compte = {
    id: 'u-1', email: 'rose.ngo@exemple.cm', nomUtilisateur: 'r.ngo', nom: 'NGO', prenoms: 'Rose',
    actif, motDePasseHash: 'hash-initial', tentativesEchouees: 4,
    bloqueJusquA: new Date(Date.now() + 600_000),
  };
  const jetons: JetonEnregistre[] = [];
  const majUtilisateur: Array<Record<string, unknown>> = [];
  const refreshRevoques: Array<Record<string, unknown>> = [];

  const jetonMotDePasse = {
    create: async ({ data }: { data: Omit<JetonEnregistre, 'id' | 'utiliseLe' | 'revoqueLe'> }) => {
      const cree = { id: `j-${jetons.length + 1}`, ...data, utiliseLe: null, revoqueLe: null };
      jetons.push(cree);
      return cree;
    },
    findFirst: async ({ where }: { where: { userId: string; expireLe: { gt: Date }; createdAt: { gt: Date } } }) =>
      jetons.find(
        (x) =>
          x.userId === where.userId && x.utiliseLe === null && x.revoqueLe === null &&
          x.expireLe > where.expireLe.gt && x.createdAt > where.createdAt.gt,
      ) ?? null,
    findUnique: async ({ where }: { where: { tokenHash: string } }) => {
      const j = jetons.find((x) => x.tokenHash === where.tokenHash);
      return j ? { ...j, user: { id: compte.id, actif: compte.actif } } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<JetonEnregistre> }) => {
      const j = jetons.find((x) => x.id === where.id);
      if (j) Object.assign(j, data);
      return j;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<JetonEnregistre> }) => {
      const cibles = jetons.filter((x) => x.userId === where.userId && x.utiliseLe === null && x.revoqueLe === null);
      cibles.forEach((x) => Object.assign(x, data));
      return { count: cibles.length };
    },
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: Record<string, string> }) => {
        if (!existe) return null;
        const trouve = (where.email && where.email === compte.email) || (where.nomUtilisateur && where.nomUtilisateur === compte.nomUtilisateur);
        return trouve ? compte : null;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => { majUtilisateur.push(data); return compte; },
    },
    jetonMotDePasse,
    refreshToken: { updateMany: async ({ data }: { data: Record<string, unknown> }) => { refreshRevoques.push(data); return { count: 1 }; } },
    // La vraie implementation passe le client transactionnel : ici le meme objet.
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };

  const audit = { journaliser: jest.fn(async () => undefined) };
  // Signature explicite : sans elle, `mock.calls` est un tuple vide et le lien
  // envoye (3e argument) serait inaccessible aux verifications.
  const mail = {
    estConfigure: mailConfigure,
    envoyerReinitialisation: jest.fn<Promise<boolean>, [destinataire: string, nomComplet: string, lien: string, dureeMinutes: number]>(async () => true),
  };
  const crypto = nouveauCrypto();
  const service = new AuthService(
    prisma as unknown as PrismaService, new JwtService({}), CONFIG as unknown as ConfigService,
    crypto, audit as unknown as AuditService, mail as unknown as MailService,
  );
  /**
   * Repousse les jetons en attente au-dela du delai de garde entre deux envois,
   * pour pouvoir enchainer deux demandes sans attendre reellement une minute.
   */
  const vieillir = () => jetons.forEach((j) => { j.createdAt = new Date(j.createdAt.getTime() - 2 * 60_000); });

  return { service, jetons, majUtilisateur, refreshRevoques, audit, mail, crypto, vieillir };
};

describe('AuthService.demanderReinitialisation', () => {
  it('enregistre un jeton et envoie un lien portant le jeton en clair', async () => {
    const { service, jetons, mail, crypto } = monterReinit();
    const r = await service.demanderReinitialisation('Rose.Ngo@Exemple.cm', ctx);

    expect(r.ok).toBe(true);
    expect(jetons).toHaveLength(1);
    expect(mail.envoyerReinitialisation).toHaveBeenCalledTimes(1);

    const lien = mail.envoyerReinitialisation.mock.calls[0][2];
    const jetonClair = decodeURIComponent(new URL(lien).searchParams.get('jeton') ?? '');
    expect(lien.startsWith('https://exemple.test/reinitialiser?jeton=')).toBe(true);
    // Le jeton en clair ne doit jamais atteindre la base : seule son empreinte y figure.
    expect(jetons[0].tokenHash).toBe(crypto.sha256(jetonClair));
    expect(jetons[0].tokenHash).not.toBe(jetonClair);
  });

  it('revoque le jeton precedent : un seul lien reste valable', async () => {
    const { service, jetons, vieillir } = monterReinit();
    await service.demanderReinitialisation('r.ngo', ctx);
    vieillir();
    await service.demanderReinitialisation('r.ngo', ctx);

    expect(jetons).toHaveLength(2);
    expect(jetons[0].revoqueLe).toBeInstanceOf(Date);
    expect(jetons[1].revoqueLe).toBeNull();
  });

  it("n'envoie pas un second courriel tant que le lien precedent est recent", async () => {
    const { service, jetons, mail } = monterReinit();
    const premier = await service.demanderReinitialisation('r.ngo', ctx);
    const second = await service.demanderReinitialisation('r.ngo', ctx);

    // Reponse inchangee : le delai de garde ne doit pas se deviner de l'exterieur.
    expect(second.message).toBe(premier.message);
    expect(mail.envoyerReinitialisation).toHaveBeenCalledTimes(1);
    // Le lien deja envoye reste valable : il n'a ete ni remplace ni revoque.
    expect(jetons).toHaveLength(1);
    expect(jetons[0].revoqueLe).toBeNull();
  });

  it('repond la meme chose pour un compte inconnu, sans ecrire de jeton ni envoyer de courriel', async () => {
    const connu = await monterReinit().service.demanderReinitialisation('r.ngo', ctx);
    const inconnu = monterReinit({ existe: false });
    const r = await inconnu.service.demanderReinitialisation('personne', ctx);

    expect(r.message).toBe(connu.message);
    expect(inconnu.jetons).toHaveLength(0);
    expect(inconnu.mail.envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('traite un compte desactive comme un compte inconnu', async () => {
    const { service, jetons, mail } = monterReinit({ actif: false });
    const r = await service.demanderReinitialisation('r.ngo', ctx);
    expect(r.ok).toBe(true);
    expect(jetons).toHaveLength(0);
    expect(mail.envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('refuse clairement lorsque le serveur SMTP n\'est pas configure', async () => {
    const { service } = monterReinit({ mailConfigure: false });
    await expect(service.demanderReinitialisation('r.ngo', ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('AuthService.reinitialiserMotDePasse', () => {
  /** Rend le jeton en clair d'une demande, tel que l'utilisateur le recoit. */
  const demander = async (m: ReturnType<typeof monterReinit>) => {
    m.vieillir(); // sinon le delai de garde renvoie le lien precedent au lieu d'en emettre un
    await m.service.demanderReinitialisation('r.ngo', ctx);
    const dernier = m.mail.envoyerReinitialisation.mock.calls.at(-1);
    if (!dernier) throw new Error('aucun courriel envoye');
    return decodeURIComponent(new URL(dernier[2]).searchParams.get('jeton') ?? '');
  };

  it('fixe le mot de passe, debloque le compte et ferme les sessions', async () => {
    const m = monterReinit();
    const jeton = await demander(m);

    await expect(m.service.reinitialiserMotDePasse(jeton, 'NouveauMotDePasse2026!', ctx)).resolves.toEqual({ ok: true });

    const maj = m.majUtilisateur.at(-1) as Record<string, unknown>;
    expect(await argon2.verify(maj.motDePasseHash as string, 'NouveauMotDePasse2026!')).toBe(true);
    expect(maj.doitChangerMotDePasse).toBe(false);
    // Un compte verrouille par cinq echecs doit retrouver l'acces apres reinitialisation.
    expect(maj.tentativesEchouees).toBe(0);
    expect(maj.bloqueJusquA).toBeNull();
    expect(m.refreshRevoques).toHaveLength(1);
    expect(m.jetons[0].utiliseLe).toBeInstanceOf(Date);
  });

  it('refuse un jeton deja utilise (usage unique)', async () => {
    const m = monterReinit();
    const jeton = await demander(m);
    await m.service.reinitialiserMotDePasse(jeton, 'NouveauMotDePasse2026!', ctx);
    await expect(m.service.reinitialiserMotDePasse(jeton, 'AutreMotDePasse2026!', ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un jeton expire', async () => {
    const m = monterReinit();
    const jeton = await demander(m);
    m.jetons[0].expireLe = new Date(Date.now() - 1000);
    await expect(m.service.reinitialiserMotDePasse(jeton, 'NouveauMotDePasse2026!', ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un jeton revoque par une demande plus recente', async () => {
    const m = monterReinit();
    const premier = await demander(m);
    await demander(m);
    await expect(m.service.reinitialiserMotDePasse(premier, 'NouveauMotDePasse2026!', ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un jeton inconnu', async () => {
    const m = monterReinit();
    await expect(m.service.reinitialiserMotDePasse('jeton-invente', 'NouveauMotDePasse2026!', ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});
