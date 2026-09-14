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

/** Reconstruit un objet en inversant l'ordre de ses cles, a tous les niveaux. */
const inverserCles = (v: unknown): unknown => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(inverserCles);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, inverserCles(x)]));
};

/**
 * Journal en memoire reproduisant la table audit_logs. Comme une colonne jsonb, il ne
 * conserve pas l'ordre des cles des objets JSON : il les restitue dans l'ordre inverse
 * et convertit les dates en chaines, ce qui est le pire cas pour le recalcul d'empreinte.
 */
class JournalFactice {
  lignes: Ligne[] = [];
  verrous = 0;
  $queryRaw = async () => {
    this.verrous++;
    return [];
  };
  $transaction = async (fn: (tx: unknown) => unknown) => fn(this);
  auditLog = {
    findFirst: async () => (this.lignes.length ? this.lignes[this.lignes.length - 1] : null),
    findMany: async () => [...this.lignes],
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const jsonb = (v: unknown) => (v === undefined || v === null ? null : inverserCles(JSON.parse(JSON.stringify(v))));
      this.lignes.push({
        sequence: BigInt(this.lignes.length + 1),
        createdAt: new Date(),
        ...data,
        valeursAvant: jsonb(data.valeursAvant),
        valeursApres: jsonb(data.valeursApres),
        metadonnees: jsonb(data.metadonnees),
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

  it('reste verifiable lorsque la base reordonne les cles JSON (jsonb)', async () => {
    const { journal, service } = nouveau();
    await service.journaliser({
      entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.MODIFICATION, acteur, contexte: ctx,
      valeursAvant: { statut: 'BROUILLON', version: 1, enfant: { nom: 'Ndongo', prenoms: 'Chloe' } },
      valeursApres: { statut: 'SOUMISE', version: 2, enfant: { nom: 'Ndongo', prenoms: 'Chloe Marie' } },
      metadonnees: { zeta: 1, alpha: 2, milieu: [{ b: 1, a: 2 }] },
    });
    // L'ordre restitue differe bien de l'ordre ecrit
    expect(Object.keys(journal.lignes[0].valeursApres as object)).toEqual(['enfant', 'version', 'statut']);
    expect(await service.verifierChaine()).toMatchObject({ integre: true, anomalies: [] });
  });

  it('conserve les dates dans les valeurs journalisees', async () => {
    const { journal, service } = nouveau();
    await service.journaliser({
      entite: 'Declaration', entiteId: 'd-1', action: ActionAudit.RECTIFICATION, acteur, contexte: ctx,
      valeursAvant: { enfantDateNaissance: new Date('2026-09-01T00:00:00.000Z') },
      valeursApres: { enfantDateNaissance: new Date('2026-08-31T00:00:00.000Z') },
    });
    expect(journal.lignes[0].valeursAvant).toEqual({ enfantDateNaissance: '2026-09-01T00:00:00.000Z' });
    expect(journal.lignes[0].valeursApres).toEqual({ enfantDateNaissance: '2026-08-31T00:00:00.000Z' });
    expect((await service.verifierChaine()).integre).toBe(true);
  });

  it("prend un verrou de transaction pour chaque ecriture, meme hors transaction metier", async () => {
    const { journal, service } = nouveau();
    await service.journaliser({ entite: 'User', entiteId: 'u-1', action: ActionAudit.CONNEXION, acteur, contexte: ctx });
    await service.journaliser({ entite: 'User', entiteId: 'u-1', action: ActionAudit.DECONNEXION, acteur, contexte: ctx }, journal as never);
    expect(journal.verrous).toBe(2);
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
