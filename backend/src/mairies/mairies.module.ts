import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags, PartialType } from '@nestjs/swagger';
import { ActionAudit, Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, CurrentUser, Public, RequestContext, Roles, UtilisateurCourant } from '../common/decorators';

// ---------------------------------------------------------------- DTO

export class CreerMairieDto {
  @IsString() @Matches(/^[A-Z0-9]{2,10}$/) code!: string;
  @IsString() nom!: string;
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

  creer(dto: CreerMairieDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.mairie.create({ data: dto, include: this.include });
      await this.audit.journaliser({ entite: 'Mairie', entiteId: m.id, action: ActionAudit.CREATION, acteur, valeursApres: dto, contexte: ctx }, tx);
      return m;
    });
  }

  async modifier(id: string, dto: ModifierMairieDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const avant = await this.obtenir(id);
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.mairie.update({ where: { id }, data: dto, include: this.include });
      await this.audit.journaliser({ entite: 'Mairie', entiteId: id, action: ActionAudit.MODIFICATION, acteur, valeursAvant: avant, valeursApres: dto, contexte: ctx }, tx);
      return m;
    });
  }

  /** Referentiel geographique (public : sert aux formulaires). */
  async referentiel(regionId?: string) {
    return this.prisma.region.findMany({
      where: regionId ? { id: regionId } : { actif: true },
      orderBy: { nom: 'asc' },
      include: {
        departements: {
          where: { actif: true }, orderBy: { nom: 'asc' },
          include: { arrondissements: { where: { actif: true }, orderBy: { nom: 'asc' } } },
        },
      },
    });
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
