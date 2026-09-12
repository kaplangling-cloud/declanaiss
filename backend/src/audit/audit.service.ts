import { Injectable } from '@nestjs/common';
import { ActionAudit, Prisma, Role } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';

export interface EntreeAudit {
  entite: string;
  entiteId: string;
  action: ActionAudit;
  declarationId?: string | null;
  acteur?: UtilisateurCourant | null;
  valeursAvant?: unknown;
  valeursApres?: unknown;
  metadonnees?: Record<string, unknown>;
  contexte?: ContexteRequete;
}

/** Champs qui ne doivent jamais apparaitre en clair dans l'audit. */
const CHAMPS_MASQUES = new Set([
  'motDePasseHash',
  'pereCniNumeroChiffre',
  'mereCniNumeroChiffre',
  'pereCniNumeroIndex',
  'mereCniNumeroIndex',
  'qrToken',
  'tokenHash',
]);

/**
 * Journal d'audit immuable.
 *  - Ecriture uniquement (aucune methode update/delete n'existe).
 *  - Chaque entree porte le hash de la precedente : une alteration ou une
 *    suppression en base est detectable par `verifierChaine()`.
 *  - Peut etre appelee dans une transaction metier pour garantir que
 *    l'action et sa trace sont commitees ensemble.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async journaliser(entree: EntreeAudit, tx?: TxClient): Promise<void> {
    const client = tx ?? this.prisma;

    const precedent = await client.auditLog.findFirst({
      orderBy: { sequence: 'desc' },
      select: { hash: true },
    });

    const payload = {
      entite: entree.entite,
      entiteId: entree.entiteId,
      action: entree.action,
      declarationId: entree.declarationId ?? null,
      acteurId: entree.acteur?.id ?? null,
      acteurRole: (entree.acteur?.role as Role) ?? null,
      acteurEmail: entree.acteur?.email ?? null,
      valeursAvant: this.masquer(entree.valeursAvant) as Prisma.InputJsonValue | undefined,
      valeursApres: this.masquer(entree.valeursApres) as Prisma.InputJsonValue | undefined,
      metadonnees: (entree.metadonnees ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: entree.contexte?.ip ?? null,
      userAgent: entree.contexte?.userAgent?.slice(0, 300) ?? null,
      hashPrecedent: precedent?.hash ?? null,
    };

    // L'horodatage entre dans le hash : il doit etre celui qui est persiste,
    // sans quoi l'empreinte ne serait pas recalculable et une alteration du
    // contenu d'une ligne resterait indetectable.
    const horodatage = new Date();
    const hash = AuditService.hacher(AuditService.empreinte(payload, horodatage));

    await client.auditLog.create({ data: { ...payload, hash, createdAt: horodatage } });
  }

  /**
   * Represente une entree sous la forme exactement hachee a l'ecriture.
   * L'ordre des cles est significatif (JSON.stringify) : ne pas le modifier
   * sans invalider les empreintes deja enregistrees.
   */
  private static empreinte(
    e: {
      entite: string;
      entiteId: string;
      action: ActionAudit;
      declarationId: string | null;
      acteurId: string | null;
      acteurRole: Role | null;
      acteurEmail: string | null;
      valeursAvant?: unknown;
      valeursApres?: unknown;
      metadonnees?: unknown;
      ip: string | null;
      userAgent: string | null;
      hashPrecedent: string | null;
    },
    horodatage: Date,
  ) {
    return {
      entite: e.entite,
      entiteId: e.entiteId,
      action: e.action,
      declarationId: e.declarationId,
      acteurId: e.acteurId,
      acteurRole: e.acteurRole,
      acteurEmail: e.acteurEmail,
      valeursAvant: e.valeursAvant ?? undefined,
      valeursApres: e.valeursApres ?? undefined,
      metadonnees: e.metadonnees ?? undefined,
      ip: e.ip,
      userAgent: e.userAgent,
      hashPrecedent: e.hashPrecedent,
      horodatage: horodatage.toISOString(),
    };
  }

  /** Journalise un acces en lecture a des donnees personnelles. */
  async journaliserAcces(
    params: {
      acteur?: UtilisateurCourant | null;
      declarationId?: string | null;
      champsSensibles?: string[];
      motif?: string;
      contexte: ContexteRequete;
    },
    tx?: TxClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.accessLog.create({
      data: {
        userId: params.acteur?.id ?? null,
        declarationId: params.declarationId ?? null,
        ressource: params.contexte.ressource,
        champsSensibles: params.champsSensibles ?? [],
        motif: params.motif ?? null,
        ip: params.contexte.ip ?? null,
        userAgent: params.contexte.userAgent?.slice(0, 300) ?? null,
      },
    });
  }

  /**
   * Recalcule l'empreinte de chaque entree et verifie le chainage.
   * Le parcours ne s'interrompt pas a la premiere anomalie : une seule ligne
   * douteuse ne doit pas laisser les suivantes non controlees.
   *
   * `CHAINAGE` signale une insertion, une suppression ou un reordonnancement ;
   * `CONTENU` signale la modification d'une ligne existante.
   */
  async verifierChaine(): Promise<{
    integre: boolean;
    total: number;
    anomalies: Array<{ sequence: string; nature: 'CHAINAGE' | 'CONTENU'; createdAt: Date }>;
    /** Premiere rupture de chainage, pour compatibilite d'affichage. */
    ruptureSequence?: string;
  }> {
    const lignes = await this.prisma.auditLog.findMany({ orderBy: { sequence: 'asc' } });
    const anomalies: Array<{ sequence: string; nature: 'CHAINAGE' | 'CONTENU'; createdAt: Date }> = [];
    let precedent: string | null = null;

    for (const l of lignes) {
      if (l.hashPrecedent !== precedent) {
        anomalies.push({ sequence: l.sequence.toString(), nature: 'CHAINAGE', createdAt: l.createdAt });
      }
      const attendu = AuditService.hacher(AuditService.empreinte(l, l.createdAt));
      if (attendu !== l.hash) {
        anomalies.push({ sequence: l.sequence.toString(), nature: 'CONTENU', createdAt: l.createdAt });
      }
      precedent = l.hash;
    }

    return {
      integre: anomalies.length === 0,
      total: lignes.length,
      anomalies,
      ruptureSequence: anomalies.find((a) => a.nature === 'CHAINAGE')?.sequence,
    };
  }

  async rechercher(filtres: {
    entite?: string;
    entiteId?: string;
    declarationId?: string;
    acteurId?: string;
    action?: ActionAudit;
    du?: Date;
    au?: Date;
    page?: number;
    taille?: number;
  }) {
    const page = Math.max(1, filtres.page ?? 1);
    const taille = Math.min(200, Math.max(1, filtres.taille ?? 50));
    const where: Prisma.AuditLogWhereInput = {
      entite: filtres.entite,
      entiteId: filtres.entiteId,
      declarationId: filtres.declarationId,
      acteurId: filtres.acteurId,
      action: filtres.action,
      createdAt: filtres.du || filtres.au ? { gte: filtres.du, lte: filtres.au } : undefined,
    };
    const [total, lignes] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { sequence: 'desc' },
        skip: (page - 1) * taille,
        take: taille,
        include: { acteur: { select: { nom: true, prenoms: true, email: true, role: true } } },
      }),
    ]);
    return {
      total,
      page,
      taille,
      lignes: lignes.map((l) => ({ ...l, sequence: l.sequence.toString() })),
    };
  }

  private masquer(valeur: unknown): unknown {
    if (valeur === null || valeur === undefined) return undefined;
    if (Array.isArray(valeur)) return valeur.map((v) => this.masquer(v));
    if (typeof valeur === 'object') {
      const sortie: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) {
        sortie[k] = CHAMPS_MASQUES.has(k) ? '***' : this.masquer(v);
      }
      return sortie;
    }
    return valeur;
  }

  private static hacher(obj: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  }
}
