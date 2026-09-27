import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { UsersService } from './users.service';

type CompteFactice = {
  id: string; email: string; role: Role; centreId: string | null; mairieId: string | null; actif: boolean;
};

const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'PATCH /utilisateurs/:id' };

const acteur = (role: Role, extra: Partial<UtilisateurCourant> = {}): UtilisateurCourant => ({
  id: `acteur-${role}`, email: `${role}@exemple.cm`, role, centreId: null, mairieId: null, nomComplet: 'Test', ...extra,
});

/** Base en memoire limitee a ce qu'utilise UsersService. */
const monter = (comptes: CompteFactice[]) => {
  const appels = { revocations: [] as unknown[], deliaisons: [] as unknown[], mises: [] as unknown[] };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        comptes.find((c) => (where.id ? c.id === where.id : c.email === where.email)) ?? null,
      count: async ({ where }: { where: { role: Role; actif: boolean; id: { not: string } } }) =>
        comptes.filter((c) => c.role === where.role && c.actif === where.actif && c.id !== where.id.not).length,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        appels.mises.push(data);
        const c = comptes.find((x) => x.id === where.id)!;
        return { ...c, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
      },
    },
    refreshToken: { updateMany: async (args: unknown) => { appels.revocations.push(args); return { count: 1 }; } },
    personnelSante: { updateMany: async (args: unknown) => { appels.deliaisons.push(args); return { count: 0 }; } },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  const audit = { journaliser: jest.fn(async () => undefined) };
  const service = new UsersService(prisma as unknown as PrismaService, audit as unknown as AuditService);
  return { service, appels, audit };
};

const sageFemme: CompteFactice = { id: 'u-sf', email: 'sf@exemple.cm', role: Role.PERSONNEL_SANTE, centreId: 'c-1', mairieId: null, actif: true };
const admin = acteur(Role.ADMIN_NATIONAL, { id: 'u-admin' });
const chef = acteur(Role.CHEF_CENTRE, { centreId: 'c-1' });

describe('UsersService.modifier', () => {
  it('interdit a un chef de centre de deplacer un agent vers un autre centre', async () => {
    const { service } = monter([{ ...sageFemme }]);
    await expect(service.modifier('u-sf', { centreId: 'c-2' }, chef, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('interdit a un chef de centre de changer un role ou une adresse de connexion', async () => {
    const { service } = monter([{ ...sageFemme }]);
    await expect(service.modifier('u-sf', { role: Role.CHEF_CENTRE }, chef, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.modifier('u-sf', { email: 'autre@exemple.cm' }, chef, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("n'oppose rien a un chef de centre qui renvoie les valeurs inchangees", async () => {
    const { service } = monter([{ ...sageFemme }]);
    await expect(service.modifier('u-sf', { role: Role.PERSONNEL_SANTE, centreId: 'c-1', nom: 'NGO' }, chef, ctx)).resolves.toBeDefined();
  });

  it('revoque les sessions lors d une reinitialisation de mot de passe', async () => {
    const { service, appels } = monter([{ ...sageFemme }]);
    await service.modifier('u-sf', { motDePasse: 'NouveauSecret2026!' }, chef, ctx);
    expect(appels.revocations).toEqual([{ where: { userId: 'u-sf', revoqueLe: null }, data: { revoqueLe: expect.any(Date) } }]);
  });

  it('ne revoque pas les sessions pour une simple mise a jour de coordonnees', async () => {
    const { service, appels } = monter([{ ...sageFemme }]);
    await service.modifier('u-sf', { telephone: '+237 600 00 00 00' }, chef, ctx);
    expect(appels.revocations).toEqual([]);
  });

  it('interdit de desactiver son propre compte', async () => {
    const { service } = monter([{ id: 'u-admin', email: 'a@exemple.cm', role: Role.ADMIN_NATIONAL, centreId: null, mairieId: null, actif: true }]);
    await expect(service.modifier('u-admin', { actif: false }, admin, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un changement de role qui laisserait un rattachement incoherent', async () => {
    const { service } = monter([{ ...sageFemme }]);
    // Officier sans mairie et toujours rattache a un centre
    await expect(service.modifier('u-sf', { role: Role.OFFICIER_ETAT_CIVIL }, admin, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applique un changement de role accompagne du bon rattachement', async () => {
    const { service, appels } = monter([{ ...sageFemme }]);
    const maj = await service.modifier(
      'u-sf',
      { role: Role.OFFICIER_ETAT_CIVIL, mairieId: 'm-1', centreId: null as unknown as string },
      admin,
      ctx,
    );
    expect(maj).toMatchObject({ role: Role.OFFICIER_ETAT_CIVIL, mairieId: 'm-1', centreId: null });
    expect(appels.mises[0]).toMatchObject({ role: Role.OFFICIER_ETAT_CIVIL, mairieId: 'm-1', centreId: null });
    // Le compte quitte son centre : sa fiche de personnel est deliee
    expect(appels.deliaisons).toHaveLength(1);
  });

  it("applique un changement d'adresse de connexion au lieu de l'ignorer", async () => {
    const { service, appels } = monter([{ ...sageFemme }]);
    await service.modifier('u-sf', { email: '  Nouvelle@Exemple.cm ' }, admin, ctx);
    expect(appels.mises[0]).toMatchObject({ email: 'nouvelle@exemple.cm' });
  });

  it('refuse une adresse de connexion deja prise', async () => {
    const { service } = monter([{ ...sageFemme }, { id: 'u-2', email: 'pris@exemple.cm', role: Role.PERSONNEL_SANTE, centreId: 'c-1', mairieId: null, actif: true }]);
    await expect(service.modifier('u-sf', { email: 'pris@exemple.cm' }, admin, ctx)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('UsersService.modifier - dernier administrateur', () => {
  const adminA: CompteFactice = { id: 'u-a', email: 'a@exemple.cm', role: Role.ADMIN_NATIONAL, centreId: null, mairieId: null, actif: true };
  const adminB: CompteFactice = { ...adminA, id: 'u-b', email: 'b@exemple.cm' };

  it('refuse de retirer le role ou de desactiver le dernier administrateur actif', async () => {
    const { service } = monter([{ ...adminA }, { ...adminB, actif: false }]);
    await expect(service.modifier('u-a', { actif: false }, acteur(Role.ADMIN_NATIONAL, { id: 'u-b' }), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.modifier('u-a', { role: Role.OFFICIER_ETAT_CIVIL, mairieId: 'm-1' }, acteur(Role.ADMIN_NATIONAL, { id: 'u-a' }), ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("l'autorise lorsqu'un autre administrateur actif demeure", async () => {
    const { service } = monter([{ ...adminA }, { ...adminB }]);
    await expect(service.modifier('u-a', { actif: false }, acteur(Role.ADMIN_NATIONAL, { id: 'u-b' }), ctx)).resolves.toBeDefined();
  });
});

describe('UsersService.creer - rattachement', () => {
  it('refuse un compte de centre porteur d une mairie', async () => {
    const { service } = monter([]);
    await expect(
      service.creer(
        { email: 'x@exemple.cm', motDePasse: 'MotDePasseLong2026', nom: 'X', prenoms: 'Y', role: Role.PERSONNEL_SANTE, centreId: 'c-1', mairieId: 'm-1' },
        admin,
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
