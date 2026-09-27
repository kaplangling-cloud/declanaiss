import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionAudit, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { CreerCentreDto, CreerPersonnelDto, ModifierCentreDto, ModifierPersonnelDto } from './dto/centre.dto';

const INCLUDE_CENTRE = {
  region: { select: { id: true, code: true, nom: true } },
  departement: { select: { id: true, code: true, nom: true } },
  arrondissement: { select: { id: true, code: true, nom: true } },
  mairie: { select: { id: true, code: true, nom: true } },
  _count: { select: { personnels: true, declarations: true } },
};

@Injectable()
export class CentresService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Cloisonnement : un compte de centre ne voit que son propre centre. */
  private assurerAcces(acteur: UtilisateurCourant, centreId: string) {
    if (acteur.role === Role.ADMIN_NATIONAL) return;
    if (acteur.centreId === centreId) return;
    throw new ForbiddenException("Acces a un autre centre interdit");
  }

  async lister(acteur: UtilisateurCourant) {
    const where =
      acteur.role === Role.ADMIN_NATIONAL ? {}
      : acteur.mairieId ? { mairieId: acteur.mairieId }
      : { id: acteur.centreId ?? '' };
    return this.prisma.centre.findMany({ where, include: INCLUDE_CENTRE, orderBy: { nom: 'asc' } });
  }

  async obtenir(id: string, acteur: UtilisateurCourant) {
    if (acteur.role !== Role.ADMIN_NATIONAL && !acteur.mairieId) this.assurerAcces(acteur, id);
    const centre = await this.prisma.centre.findUnique({
      where: { id },
      include: { ...INCLUDE_CENTRE, personnels: { orderBy: { nom: 'asc' } } },
    });
    if (!centre) throw new NotFoundException('Centre introuvable');
    if (acteur.mairieId && centre.mairieId !== acteur.mairieId && acteur.role !== Role.ADMIN_NATIONAL) {
      throw new ForbiddenException();
    }
    return centre;
  }

  private async validerHierarchie(dto: { regionId?: string; departementId?: string; arrondissementId?: string; mairieId?: string }) {
    if (dto.arrondissementId) {
      const arr = await this.prisma.arrondissement.findUnique({ where: { id: dto.arrondissementId }, include: { departement: true } });
      if (!arr) throw new BadRequestException('Arrondissement inconnu');
      if (dto.departementId && arr.departementId !== dto.departementId) throw new BadRequestException("L'arrondissement n'appartient pas au departement");
      if (dto.regionId && arr.departement.regionId !== dto.regionId) throw new BadRequestException("Le departement n'appartient pas a la region");
    }
    if (dto.mairieId) {
      const mairie = await this.prisma.mairie.findUnique({ where: { id: dto.mairieId } });
      if (!mairie || !mairie.actif) throw new BadRequestException('Mairie inconnue ou inactive');
    }
  }

  async creer(dto: CreerCentreDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    await this.validerHierarchie(dto);
    return this.prisma.$transaction(async (tx) => {
      const centre = await tx.centre.create({
        data: {
          ...dto,
          autorisationDateDelivrance: new Date(dto.autorisationDateDelivrance),
          autorisationDateFinValidite: dto.autorisationDateFinValidite ? new Date(dto.autorisationDateFinValidite) : null,
        },
        include: INCLUDE_CENTRE,
      });
      await this.audit.journaliser({ entite: 'Centre', entiteId: centre.id, action: ActionAudit.CREATION, acteur, valeursApres: dto, contexte: ctx }, tx);
      return centre;
    });
  }

  async modifier(id: string, dto: ModifierCentreDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const avant = await this.prisma.centre.findUnique({ where: { id } });
    if (!avant) throw new NotFoundException();
    if (acteur.role !== Role.ADMIN_NATIONAL) {
      this.assurerAcces(acteur, id);
      // Un chef de centre ne peut modifier que les coordonnees, pas le rattachement ni l'autorisation
      const interdits = ['code', 'numeroAutorisation', 'autorisationDateDelivrance', 'autorisationDateFinValidite', 'regionId', 'departementId', 'arrondissementId', 'mairieId', 'actif'] as const;
      for (const k of interdits) if (dto[k] !== undefined) throw new ForbiddenException(`Champ ${k} reserve a l'administrateur national`);
    }

    // La coherence region > departement > arrondissement porte sur l'etat qui resultera
    // de la modification : validee sur les seuls champs envoyes, changer l'arrondissement
    // seul pouvait le placer hors de la region du centre.
    const changeGeo = dto.regionId !== undefined || dto.departementId !== undefined || dto.arrondissementId !== undefined;
    await this.validerHierarchie({
      ...(changeGeo
        ? {
            regionId: dto.regionId ?? avant.regionId,
            departementId: dto.departementId ?? avant.departementId,
            arrondissementId: dto.arrondissementId ?? avant.arrondissementId,
          }
        : {}),
      mairieId: dto.mairieId !== avant.mairieId ? dto.mairieId : undefined,
    });

    // Le code entre dans chaque numero de declaration : fige des la premiere numerotation.
    // (Controle d'integrite reserve a l'administrateur, qui voit toutes les declarations.)
    if (dto.code !== undefined && dto.code !== avant.code) {
      const numerotees = await this.prisma.declaration.count({ where: { centreId: id, numeroDeclaration: { not: null } } });
      if (numerotees > 0) {
        throw new ForbiddenException({
          message: `Code non modifiable : ${numerotees} declaration(s) portent deja le code ${avant.code}`,
          code: 'CODE_CENTRE_FIGE',
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const centre = await tx.centre.update({
        where: { id },
        data: {
          ...dto,
          autorisationDateDelivrance: dto.autorisationDateDelivrance ? new Date(dto.autorisationDateDelivrance) : undefined,
          // null efface la date de fin (autorisation sans limite) ; absent, elle est conservee
          autorisationDateFinValidite:
            dto.autorisationDateFinValidite === null ? null
            : dto.autorisationDateFinValidite ? new Date(dto.autorisationDateFinValidite) : undefined,
          desactiveLe: dto.actif === false ? new Date() : dto.actif === true ? null : undefined,
        },
        include: INCLUDE_CENTRE,
      });
      await this.audit.journaliser({ entite: 'Centre', entiteId: id, action: ActionAudit.MODIFICATION, acteur, valeursAvant: avant, valeursApres: dto, contexte: ctx }, tx);
      return centre;
    });
  }

  // ---- Personnel de sante habilite ----

  async listerPersonnel(centreId: string, acteur: UtilisateurCourant) {
    this.assurerAcces(acteur, centreId);
    return this.prisma.personnelSante.findMany({
      where: { centreId },
      orderBy: [{ habilite: 'desc' }, { nom: 'asc' }],
      include: { user: { select: { id: true, email: true, actif: true } } },
    });
  }

  async ajouterPersonnel(centreId: string, dto: CreerPersonnelDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    this.assurerAcces(acteur, centreId);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.personnelSante.create({ data: { ...dto, centreId } });
      await this.audit.journaliser({ entite: 'PersonnelSante', entiteId: p.id, action: ActionAudit.CREATION, acteur, valeursApres: dto, contexte: ctx }, tx);
      return p;
    });
  }

  async modifierPersonnel(centreId: string, id: string, dto: ModifierPersonnelDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    this.assurerAcces(acteur, centreId);
    const avant = await this.prisma.personnelSante.findFirst({ where: { id, centreId } });
    if (!avant) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.personnelSante.update({ where: { id }, data: dto });
      await this.audit.journaliser({ entite: 'PersonnelSante', entiteId: id, action: ActionAudit.MODIFICATION, acteur, valeursAvant: avant, valeursApres: dto, contexte: ctx }, tx);
      return p;
    });
  }
}
