import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { MairiesService } from './mairies.module';

const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'PATCH /mairies/:id' };
const admin: UtilisateurCourant = { id: 'u-admin', email: 'a@exemple.cm', role: Role.ADMIN_NATIONAL, centreId: null, mairieId: null, nomComplet: 'Admin' };

/** Ebolowa 1er et 2e (Mvila, Sud) ; Yaounde 1er (Mfoundi, Centre). */
const arrondissements: Record<string, object> = {
  'a-ebo1': { id: 'a-ebo1', nom: 'Ebolowa 1er', code: 'A309', actif: true, departementId: 'd-mvila', departement: { code: 'D50', regionId: 'r-sud', region: { code: 'R09' } } },
  'a-ebo2': { id: 'a-ebo2', nom: 'Ebolowa 2e', code: 'A310', actif: true, departementId: 'd-mvila', departement: { code: 'D50', regionId: 'r-sud', region: { code: 'R09' } } },
  'a-yde1': { id: 'a-yde1', nom: 'Yaounde 1er', code: 'A050', actif: true, departementId: 'd-mfoundi', departement: { code: 'D08', regionId: 'r-centre', region: { code: 'R02' } } },
};

const monter = ({ actes = 0, centresActifs = 0, occupee = false } = {}) => {
  const mises: Array<Record<string, unknown>> = [];
  const mairie = {
    id: 'm-1', code: '09050309', nom: "Centre d'etat civil d'Ebolowa 1er", actif: true,
    regionId: 'r-sud', departementId: 'd-mvila', arrondissementId: 'a-ebo1', _count: { centres: 1, declarations: 0, actes },
  };
  const prisma = {
    mairie: {
      findUnique: async () => ({ ...mairie }),
      findFirst: async () => (occupee ? { code: '09050310', nom: "Centre d'etat civil d'Ebolowa 2e" } : null),
      update: async ({ data }: { data: Record<string, unknown> }) => { mises.push(data); return { ...mairie, ...data }; },
    },
    arrondissement: { findUnique: async ({ where }: { where: { id: string } }) => arrondissements[where.id] ?? null },
    centre: { count: async () => centresActifs },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma),
  };
  const audit = { journaliser: jest.fn(async () => undefined) };
  return { service: new MairiesService(prisma as unknown as PrismaService, audit as unknown as AuditService), mises };
};

describe('MairiesService.modifier', () => {
  it('modifie les coordonnees sans toucher au code', async () => {
    const { service, mises } = monter({ actes: 16 });
    await service.modifier('m-1', { nom: 'Mairie d\'Ebolowa 1er', telephone: '+237 222 28 00 00' }, admin, ctx);
    expect(mises[0]).toMatchObject({ nom: "Mairie d'Ebolowa 1er", telephone: '+237 222 28 00 00' });
    expect(mises[0].code).toBeUndefined();
  });

  it("recalcule le code quand l'arrondissement change et qu'aucun acte n'est dresse", async () => {
    const { service, mises } = monter();
    await service.modifier('m-1', { arrondissementId: 'a-ebo2' }, admin, ctx);
    expect(mises[0]).toMatchObject({ arrondissementId: 'a-ebo2', code: '09050310' });
  });

  it("refuse de changer d'arrondissement une mairie qui a dresse des actes", async () => {
    const { service } = monter({ actes: 3 });
    await expect(service.modifier('m-1', { arrondissementId: 'a-ebo2' }, admin, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un arrondissement hors de la region de la mairie', async () => {
    const { service } = monter();
    await expect(service.modifier('m-1', { arrondissementId: 'a-yde1' }, admin, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un arrondissement qui a deja son centre d\'etat civil', async () => {
    const { service } = monter({ occupee: true });
    await expect(service.modifier('m-1', { arrondissementId: 'a-ebo2' }, admin, ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuse de desactiver une mairie a laquelle des centres actifs sont rattaches', async () => {
    const { service } = monter({ centresActifs: 2 });
    await expect(service.modifier('m-1', { actif: false }, admin, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('desactive une mairie sans centre actif', async () => {
    const { service, mises } = monter({ centresActifs: 0 });
    await service.modifier('m-1', { actif: false }, admin, ctx);
    expect(mises[0]).toMatchObject({ actif: false });
  });
});
