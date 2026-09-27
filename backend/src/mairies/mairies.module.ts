import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ActionAudit, Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { codeCentreEtatCivil, nomCentreEtatCivil } from '../common/referentiel/code-etat-civil';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, CurrentUser, Public, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';

// ---------------------------------------------------------------- DTO

/**
 * Le code n'est pas saisi : il est calcule a partir de la region, du departement
 * et de l'arrondissement selon la regle de RDC.xlsx (cf. codeCentreEtatCivil).
 */
export class CreerMairieDto {
  @ApiPropertyOptional({ description: "Par defaut : « Centre d'état civil de {arrondissement} »" })
  @IsOptional() @IsString() @MaxLength(200) nom?: string;
  @IsOptional() @IsString() adresse?: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsUUID() regionId!: string;
  @IsUUID() departementId!: string;
  @IsUUID() arrondissementId!: string;
}

export class ModifierMairieDto extends PartialType(CreerMairieDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() actif?: boolean;
}

// ------------------------------------------------------------ SERVICE

@Injectable()
export class MairiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private readonly include = {
    region: { select: { id: true, code: true, nom: true } },
    departement: { select: { id: true, code: true, nom: true } },
    arrondissement: { select: { id: true, code: true, nom: true } },
    _count: { select: { centres: true, declarations: true, actes: true } },
  };

  lister() {
    return this.prisma.mairie.findMany({ include: this.include, orderBy: { nom: 'asc' } });
  }

  async obtenir(id: string) {
    const m = await this.prisma.mairie.findUnique({ where: { id }, include: { ...this.include, centres: { select: { id: true, code: true, nom: true, actif: true } } } });
    if (!m) throw new NotFoundException('Mairie introuvable');
    return m;
  }

  /**
   * Verifie que l'arrondissement appartient au departement et a la region indiques,
   * puis en deduit le code du centre d'etat civil.
   */
  private async circonscription(tx: TxClient, ids: { regionId: string; departementId: string; arrondissementId: string }) {
    const arr = await tx.arrondissement.findUnique({
      where: { id: ids.arrondissementId },
      include: { departement: { include: { region: true } } },
    });
    if (!arr || !arr.actif) throw new BadRequestException('Arrondissement inconnu ou inactif');
    if (arr.departementId !== ids.departementId) throw new BadRequestException("L'arrondissement n'appartient pas au departement");
    if (arr.departement.regionId !== ids.regionId) throw new BadRequestException("Le departement n'appartient pas a la region");
    try {
      return { arrondissement: arr, code: codeCentreEtatCivil(arr.departement.region.code, arr.departement.code, arr.code) };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** Un centre d'etat civil par arrondissement : le code en derive et reste unique. */
  private async assurerDisponible(tx: TxClient, code: string, arrondissementId: string, nomArrondissement: string, saufId?: string) {
    const existante = await tx.mairie.findFirst({
      where: { OR: [{ code }, { arrondissementId }], ...(saufId ? { id: { not: saufId } } : {}) },
      select: { code: true, nom: true },
    });
    if (existante) {
      throw new ConflictException({
        message: `Un centre d'etat civil existe deja pour ${nomArrondissement} : ${existante.nom} (code ${existante.code})`,
        code: 'MAIRIE_EXISTANTE',
      });
    }
  }

  creer(dto: CreerMairieDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    return this.prisma.$transaction(async (tx) => {
      const { arrondissement, code } = await this.circonscription(tx, dto);
      await this.assurerDisponible(tx, code, arrondissement.id, arrondissement.nom);
      const data = { ...dto, code, nom: dto.nom?.trim() || nomCentreEtatCivil(arrondissement.nom) };
      const m = await tx.mairie.create({ data, include: this.include });
      await this.audit.journaliser({ entite: 'Mairie', entiteId: m.id, action: ActionAudit.CREATION, acteur, valeursApres: data, contexte: ctx }, tx);
      return m;
    });
  }

  async modifier(id: string, dto: ModifierMairieDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const avant = await this.obtenir(id);
    return this.prisma.$transaction(async (tx) => {
      const data: ModifierMairieDto & { code?: string } = { ...dto };
      // Une mairie desactivee continuerait de recevoir les declarations des centres qui
      // lui sont rattaches : ils doivent d'abord etre reaffectes (ou desactives).
      if (dto.actif === false && avant.actif) {
        const centresActifs = await tx.centre.count({ where: { mairieId: id, actif: true } });
        if (centresActifs > 0) {
          throw new ForbiddenException({
            message: `Desactivation impossible : ${centresActifs} centre(s) de sante actif(s) y sont rattache(s) ; les rattacher d'abord a une autre mairie`,
            code: 'MAIRIE_CENTRES_ACTIFS',
          });
        }
      }
      if (dto.regionId !== undefined || dto.departementId !== undefined || dto.arrondissementId !== undefined) {
        const { arrondissement, code } = await this.circonscription(tx, {
          regionId: dto.regionId ?? avant.regionId,
          departementId: dto.departementId ?? avant.departementId,
          arrondissementId: dto.arrondissementId ?? avant.arrondissementId,
        });
        if (code !== avant.code) {
          // Le code figure dans le numero des actes deja dresses : il ne peut plus changer
          if (avant._count.actes > 0) {
            throw new ForbiddenException({
              message: `Rattachement non modifiable : ${avant._count.actes} acte(s) portent deja le code ${avant.code}`,
              code: 'CODE_MAIRIE_FIGE',
            });
          }
          await this.assurerDisponible(tx, code, arrondissement.id, arrondissement.nom, id);
          data.code = code;
        }
      }
      const m = await tx.mairie.update({ where: { id }, data, include: this.include });
      await this.audit.journaliser({ entite: 'Mairie', entiteId: id, action: ActionAudit.MODIFICATION, acteur, valeursAvant: avant, valeursApres: data, contexte: ctx }, tx);
      return m;
    });
  }

  /** Referentiel geographique (public : sert aux formulaires). */
  async referentiel(regionId?: string) {
    const regions = await this.prisma.region.findMany({
      where: regionId ? { id: regionId } : { actif: true },
      orderBy: { nom: 'asc' },
      include: {
        departements: {
          where: { actif: true }, orderBy: { nom: 'asc' },
          include: { arrondissements: { where: { actif: true }, orderBy: { nom: 'asc' } } },
        },
      },
    });
    // Code du centre d'etat civil de chaque arrondissement, pour l'apercu du formulaire
    return regions.map((r) => ({
      ...r,
      departements: r.departements.map((d) => ({
        ...d,
        arrondissements: d.arrondissements.map((a) => ({ ...a, codeEtatCivil: MairiesService.codeOuNull(r.code, d.code, a.code) })),
      })),
    }));
  }

  private static codeOuNull(region: string, departement: string, arrondissement: string): string | null {
    try {
      return codeCentreEtatCivil(region, departement, arrondissement);
    } catch {
      return null;
    }
  }
}

// --------------------------------------------------------- CONTROLLER

@ApiTags('mairies')
@ApiBearerAuth()
@Controller('mairies')
export class MairiesController {
  constructor(private readonly mairies: MairiesService) {}

  @Public()
  @Get('referentiel')
  referentiel(@Query('regionId') regionId?: string) {
    return this.mairies.referentiel(regionId);
  }

  @Get()
  lister() {
    return this.mairies.lister();
  }

  @Get(':id')
  obtenir(@Param('id', ParseUUIDPipe) id: string) {
    return this.mairies.obtenir(id);
  }

  @Post()
  @Roles(Role.ADMIN_NATIONAL)
  creer(@Body() dto: CreerMairieDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.mairies.creer(dto, acteur, ctx);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_NATIONAL)
  modifier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModifierMairieDto, @CurrentUser() acteur: UtilisateurCourant, @RequestContext() ctx: ContexteRequete) {
    return this.mairies.modifier(id, dto, acteur, ctx);
  }
}

// ------------------------------------------------------------- MODULE

@Module({
  providers: [MairiesService],
  controllers: [MairiesController],
  exports: [MairiesService],
})
export class MairiesModule {}
