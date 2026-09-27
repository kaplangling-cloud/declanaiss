import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { CentresService } from './centres.service';

const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'PATCH /centres/:id' };
const admin: UtilisateurCourant = { id: 'u-admin', email: 'a@exemple.cm', role: Role.ADMIN_NATIONAL, centreId: null, mairieId: null, nomComplet: 'Admin' };

const centre = {
  id: 'c-1', code: 'HREBO', nom: "Hopital Regional d'Ebolowa", regionId: 'r-sud', departementId: 'd-mvila', arrondissementId: 'a-ebo1',
  mairieId: 'm-1', actif: true, autorisationDateFinValidite: new Date('2030-03-14'),
};

/** Referentiel : Ebolowa 1er et 2e dans la Mvila (Sud) ; Yaounde 1er dans le Mfoundi (Centre). */
const arrondissements: Record<string, { id: string; departementId: string; departement: { regionId: string } }> = {
  'a-ebo1': { id: 'a-ebo1', departementId: 'd-mvila', departement: { regionId: 'r-sud' } },
  'a-ebo2': { id: 'a-ebo2', departementId: 'd-mvila', departement: { regionId: 'r-sud' } },
  'a-yde1': { id: 'a-yde1', departementId: 'd-mfoundi', departement: { regionId: 'r-centre' } },
};

const monter = (numerotees = 0) => {
  const mises: Array<Record<string, unknown>> = [];
  const prisma = {
    centre: {
      findUnique: async () => ({ ...centre }),
      update: async ({ data }: { data: Record<string, unknown> }) => { mises.push(data); return { ...centre, ...data }; },
    },
    arrondissement: { findUnique: async ({ where }: { where: { id: string } }) => arrondissements[where.id] ?? null },
    mairie: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, actif: where.id !== 'm-inactive' }) },
    declaration: { count: async () => numerotees },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  const audit = { journaliser: jest.fn(async () => undefined) };
  return { service: new CentresService(prisma as unknown as PrismaService, audit as unknown as AuditService), mises };
};

describe('CentresService.modifier (administrateur)', () => {
  it("refuse un arrondissement hors de la region du centre, meme envoye seul", async () => {
    const { service } = monter();
    await expect(service.modifier('c-1', { arrondissementId: 'a-yde1' }, admin, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte un arrondissement du meme departement', async () => {
    const { service, mises } = monter();
    await service.modifier('c-1', { arrondissementId: 'a-ebo2' }, admin, ctx);
    expect(mises[0]).toMatchObject({ arrondissementId: 'a-ebo2' });
  });

  it('refuse le rattachement a une mairie inactive', async () => {
    const { service } = monter();
    await expect(service.modifier('c-1', { mairieId: 'm-inactive' }, admin, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fige le code des que des declarations sont numerotees', async () => {
    const { service } = monter(3);
    await expect(service.modifier('c-1', { code: 'HREBO2' }, admin, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("autorise le changement de code tant qu'aucune declaration n'est numerotee", async () => {
    const { service, mises } = monter(0);
    await service.modifier('c-1', { code: 'HREBO2' }, admin, ctx);
    expect(mises[0]).toMatchObject({ code: 'HREBO2' });
  });

  it("efface la date de fin d'autorisation sur null et la conserve si absente", async () => {
    const { service, mises } = monter();
    await service.modifier('c-1', { autorisationDateFinValidite: null as unknown as string }, admin, ctx);
    await service.modifier('c-1', { chefContact: '+237 600 00 00 00' }, admin, ctx);
    expect(mises[0].autorisationDateFinValidite).toBeNull();
    expect(mises[1].autorisationDateFinValidite).toBeUndefined();
  });
});
