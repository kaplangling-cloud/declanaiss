import { ActionAudit, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';

type Ligne = {
  sequence: bigint;
  entite: string;
  entiteId: string;
  action: ActionAudit;
  declarationId: string | null;
  acteurId: string | null;
  acteurRole: Role | null;
  acteurEmail: string | null;
  valeursAvant: unknown;
  valeursApres: unknown;
  metadonnees: unknown;
  ip: string | null;
  userAgent: string | null;
  hashPrecedent: string | null;
  hash: string;
  createdAt: Date;
};

/** Journal en memoire reproduisant le comportement de la table audit_logs. */
class JournalFactice {
  lignes: Ligne[] = [];
  auditLog = {
    findFirst: async () => (this.lignes.length ? this.lignes[this.lignes.length - 1] : null),
    findMany: async () => [...this.lignes],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.lignes.push({
        sequence: BigInt(this.lignes.length + 1),
        valeursAvant: null,
        valeursApres: null,
        metadonnees: null,
        createdAt: new Date(),
        ...data,
      } as Ligne);
    },
  };
}

const acteur: UtilisateurCourant = {
  id: 'u-1', email: 'officier@exemple.cm', role: Role.OFFICIER_ETAT_CIVIL,
  centreId: null, mairieId: 'm-1', nomComplet: 'Aline NKOLO',
};
const ctx: ContexteRequete = { ip: '10.0.0.1', userAgent: 'jest', ressource: 'POST /declarations' };

const nouveau = () => {
  const journal = new JournalFactice();
  return { journal, service: new AuditService(journal as unknown as PrismaService) };
};

describe('AuditService - chaine immuable', () => {
  it('chaine les entrees et les declare integres', async () => {
    const { journal, service } = nouveau();
    for (const action of [ActionAudit.CREATION, ActionAudit.SOUMISSION, ActionAudit.VALIDATION]) {
      await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action, acteur, contexte: ctx });
    }
    expect(journal.lignes).toHaveLength(3);
    expect(journal.lignes[0].hashPrecedent).toBeNull();
    expect(journal.lignes[1].hashPrecedent).toBe(journal.lignes[0].hash);
    expect(journal.lignes[2].hashPrecedent).toBe(journal.lignes[1].hash);

    const bilan = await service.verifierChaine();
    expect(bilan).toMatchObject({ integre: true, total: 3, anomalies: [] });
  });

  it("persiste l'horodatage qui entre dans l'empreinte", async () => {
    const { journal, service } = nouveau();
    await service.journaliser({ entite: 'User', entiteId: 'u-1', action: ActionAudit.CONNEXION, acteur, contexte: ctx });
    // Si createdAt differait de l'horodatage hache, l'empreinte serait
    // irreproductible et le controle de contenu impossible.
    expect((await service.verifierChaine()).integre).toBe(true);
    expect(journal.lignes[0].createdAt).toBeInstanceOf(Date);
  });

  it('detecte la modification du contenu d une entree', async () => {
    const { journal, service } = nouveau();
    await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.CREATION, acteur, contexte: ctx });
    await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.VALIDATION, acteur, contexte: ctx });

    journal.lignes[0].acteurEmail = 'quelquun.dautre@exemple.cm';

    const bilan = await service.verifierChaine();
    expect(bilan.integre).toBe(false);
    expect(bilan.anomalies).toEqual([expect.objectContaining({ sequence: '1', nature: 'CONTENU' })]);
  });

  it('detecte la suppression d une entree', async () => {
    const { journal, service } = nouveau();
    for (let i = 0; i < 3; i++) {
      await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.MODIFICATION, acteur, contexte: ctx });
    }
    journal.lignes.splice(1, 1);
    const bilan = await service.verifierChaine();
    expect(bilan.integre).toBe(false);
    expect(bilan.ruptureSequence).toBe('3');
  });

  it('signale une entree inseree hors du service, sans arreter le controle', async () => {
    const { journal, service } = nouveau();
    await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.CREATION, acteur, contexte: ctx });
    // Insertion directe en base : ni chainage ni empreinte valides
    journal.lignes.push({
      sequence: 2n, entite: 'User', entiteId: 'u-9', action: ActionAudit.CREATION_COMPTE,
      declarationId: null, acteurId: null, acteurRole: null, acteurEmail: 'systeme',
      valeursAvant: null, valeursApres: null, metadonnees: null, ip: null, userAgent: null,
      hashPrecedent: null, hash: 'empreinte-arbitraire', createdAt: new Date(),
    });
    await service.journaliser({ entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.VALIDATION, acteur, contexte: ctx });

    const bilan = await service.verifierChaine();
    expect(bilan.total).toBe(3);
    // Les entrees suivantes restent controlees : le parcours ne s'interrompt pas
    expect(bilan.anomalies.filter((a) => a.sequence === '2')).toHaveLength(2);
    expect(bilan.anomalies.some((a) => a.sequence === '3')).toBe(false);
  });

  it('masque les champs sensibles avant de les journaliser', async () => {
    const { journal, service } = nouveau();
    await service.journaliser({
      entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.MODIFICATION, acteur, contexte: ctx,
      valeursApres: { enfantNom: 'Essomba', pereCniNumeroChiffre: 'v1:secret', qrToken: 'jeton' },
    });
    const trace = JSON.stringify(journal.lignes[0].valeursApres);
    expect(trace).toContain('Essomba');
    expect(trace).not.toContain('v1:secret');
    expect(trace).not.toContain('jeton');
    expect((await service.verifierChaine()).integre).toBe(true);
  });
});
