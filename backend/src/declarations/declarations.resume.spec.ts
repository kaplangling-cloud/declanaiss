import { ConfigService } from '@nestjs/config';
import { Role, StatutDeclaration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UtilisateurCourant } from '../common/decorators';
import { DeclarationsService } from './declarations.service';

const centre: UtilisateurCourant = { id: 'u-1', email: 'c@exemple.cm', role: Role.CHEF_CENTRE, centreId: 'c-1', mairieId: null, nomComplet: 'Chef' };

describe('DeclarationsService.resume - naissances par mois', () => {
  const ilYA = (mois: number, jour = 10) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - mois, jour));
  };

  const monter = (naissances: Date[]) => {
    const requetes: unknown[] = [];
    const prisma = {
      declaration: {
        groupBy: async () => [{ statut: StatutDeclaration.SOUMISE, _count: { _all: 2 } }],
        count: async () => 0,
        findMany: async (args: unknown) => { requetes.push(args); return naissances.map((enfantDateNaissance) => ({ enfantDateNaissance })); },
      },
    };
    const service = new DeclarationsService(
      prisma as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never, {} as never,
      { get: () => 7 } as unknown as ConfigService,
    );
    return { service, requetes };
  };

  it('renvoie 12 mois consecutifs, le mois en cours en dernier, avec des zeros', async () => {
    const { service } = monter([ilYA(0), ilYA(0, 2), ilYA(3)]);
    const { parMois } = await service.resume(centre);
    expect(parMois).toHaveLength(12);
    expect(parMois[11]).toEqual({ mois: new Date().toISOString().slice(0, 7), total: 2 });
    expect(parMois[8].total).toBe(1);
    expect(parMois.reduce((s, m) => s + m.total, 0)).toBe(3);
  });

  it('reste dans le perimetre de l acteur et exclut les brouillons', async () => {
    const { service, requetes } = monter([]);
    await service.resume(centre);
    expect(JSON.stringify(requetes[0])).toContain('"centreId":"c-1"');
    expect(JSON.stringify(requetes[0])).toContain('"not":"BROUILLON"');
  });
});
