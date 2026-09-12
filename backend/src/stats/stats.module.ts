import { Controller, Get, Injectable, Module, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActionAudit, Prisma, Role, StatutDeclaration } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, CurrentUser, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';

export class FiltresStatsDto {
  @IsOptional() @IsDateString() du?: string;
  @IsOptional() @IsDateString() au?: string;
  @IsOptional() @IsUUID() centreId?: string;
  @IsOptional() @IsUUID() mairieId?: string;
  @IsOptional() @IsEnum(['jour', 'mois', 'annee']) granularite?: 'jour' | 'mois' | 'annee';
}

/**
 * Statistiques : naissances par centre, par periode, par mode d'accouchement.
 * Les brouillons sont exclus (seules les declarations soumises comptent).
 * Perimetre : admin = national ; mairie = ses centres ; centre = lui-meme.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private perimetre(f: FiltresStatsDto, acteur: UtilisateurCourant): Prisma.DeclarationWhereInput {
    const base: Prisma.DeclarationWhereInput = {
      statut: { not: StatutDeclaration.BROUILLON },
      enfantDateNaissance: f.du || f.au ? { gte: f.du ? new Date(f.du) : undefined, lte: f.au ? new Date(f.au) : undefined } : undefined,
    };
    if (acteur.role === Role.ADMIN_NATIONAL) return { ...base, centreId: f.centreId, mairieId: f.mairieId };
    if (acteur.mairieId) return { ...base, mairieId: acteur.mairieId, centreId: f.centreId };
    return { ...base, centreId: acteur.centreId ?? '' };
  }

  async synthese(f: FiltresStatsDto, acteur: UtilisateurCourant) {
    const where = this.perimetre(f, acteur);
    const [total, parStatut, parMode, parTerme, parSexe, parCentre, parPeriode] = await Promise.all([
      this.prisma.declaration.count({ where }),
      this.prisma.declaration.groupBy({ by: ['statut'], where, _count: { _all: true } }),
      this.prisma.declaration.groupBy({ by: ['modeAccouchement'], where, _count: { _all: true } }),
      this.prisma.declaration.groupBy({ by: ['termeGrossesse'], where, _count: { _all: true } }),
      this.prisma.declaration.groupBy({ by: ['enfantSexe'], where, _count: { _all: true } }),
      this.prisma.declaration.groupBy({ by: ['centreId'], where, _count: { _all: true }, _avg: { poidsNaissanceGrammes: true } }),
      this.parPeriode(where, f.granularite ?? 'mois'),
    ]);
    const centres = await this.prisma.centre.findMany({ where: { id: { in: parCentre.map((c) => c.centreId) } }, select: { id: true, code: true, nom: true } });
    const nomCentre = new Map(centres.map((c) => [c.id, c]));
    return {
      total,
      parStatut: this.aplatir(parStatut, 'statut'),
      parModeAccouchement: this.aplatir(parMode, 'modeAccouchement'),
      parTerme: this.aplatir(parTerme, 'termeGrossesse'),
      parSexe: this.aplatir(parSexe, 'enfantSexe'),
      parCentre: parCentre.map((c) => ({ centre: nomCentre.get(c.centreId), total: c._count._all, poidsMoyen: c._avg.poidsNaissanceGrammes ? Math.round(c._avg.poidsNaissanceGrammes) : null })),
      parPeriode,
    };
  }

  private aplatir<T extends Record<string, any>>(groupes: T[], cle: string) {
    return groupes.map((g) => ({ cle: g[cle] ?? 'NON_RENSEIGNE', total: g._count._all }));
  }

  private async parPeriode(where: Prisma.DeclarationWhereInput, granularite: 'jour' | 'mois' | 'annee') {
    const lignes = await this.prisma.declaration.findMany({ where, select: { enfantDateNaissance: true, modeAccouchement: true } });
    const fmt = (d: Date) => granularite === 'jour' ? d.toISOString().slice(0, 10) : granularite === 'mois' ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 4);
    const agg = new Map<string, { periode: string; total: number; voieBasse: number; cesarienne: number }>();
    for (const l of lignes) {
      if (!l.enfantDateNaissance) continue;
      const k = fmt(l.enfantDateNaissance);
      const e = agg.get(k) ?? { periode: k, total: 0, voieBasse: 0, cesarienne: 0 };
      e.total++;
      if (l.modeAccouchement === 'VOIE_BASSE') e.voieBasse++;
      if (l.modeAccouchement === 'CESARIENNE') e.cesarienne++;
      agg.set(k, e);
    }
    return [...agg.values()].sort((a, b) => a.periode.localeCompare(b.periode));
  }

  /**
   * Echappement CSV : un nom de centre contenant `;`, un guillemet ou un saut
   * de ligne ne doit pas decaler les colonnes, et une valeur commencant par
   * `=`, `+`, `-` ou `@` ne doit pas etre interpretee comme une formule par le
   * tableur qui l'ouvre.
   */
  private static champCsv(valeur: string | number | null | undefined): string {
    if (valeur === null || valeur === undefined) return '';
    let v = String(valeur);
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  /** Export CSV agrege (aucune donnee nominative). */
  async exportCsv(f: FiltresStatsDto, acteur: UtilisateurCourant, ctx: ContexteRequete): Promise<string> {
    const s = await this.synthese(f, acteur);
    const c$ = StatsService.champCsv;
    const ligne = (...champs: Array<string | number | null | undefined>) => champs.map(c$).join(';');

    const l: string[] = [ligne('section', 'cle', 'total', 'complement')];
    s.parCentre.forEach((c) =>
      l.push(ligne('centre', `${c.centre?.code ?? ''} ${c.centre?.nom ?? ''}`.trim(), c.total, `poids moyen ${c.poidsMoyen ?? ''} g`)),
    );
    s.parPeriode.forEach((p) => l.push(ligne('periode', p.periode, p.total, `voie basse ${p.voieBasse} / cesarienne ${p.cesarienne}`)));
    s.parModeAccouchement.forEach((m) => l.push(ligne('mode_accouchement', m.cle, m.total, '')));
    s.parTerme.forEach((t) => l.push(ligne('terme', t.cle, t.total, '')));
    s.parSexe.forEach((t) => l.push(ligne('sexe', t.cle, t.total, '')));
    s.parStatut.forEach((t) => l.push(ligne('statut', t.cle, t.total, '')));
    await this.audit.journaliser({ entite: 'Stats', entiteId: 'export', action: ActionAudit.EXPORT, acteur, metadonnees: { filtres: f as any, lignes: l.length }, contexte: ctx });
    return '﻿' + l.join('\r\n');
  }
}

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
@Roles(Role.ADMIN_NATIONAL, Role.OFFICIER_ETAT_CIVIL, Role.SECRETAIRE_MAIRIE, Role.CHEF_CENTRE)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  synthese(@Query() f: FiltresStatsDto, @CurrentUser() acteur: UtilisateurCourant) {
    return this.stats.synthese(f, acteur);
  }

  @Get('export.csv')
  async exportCsv(@Query() f: FiltresStatsDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete, @Res() res: Response) {
    const csv = await this.stats.exportCsv(f, acteur, ctx);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="statistiques-naissances-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}

@Module({
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
