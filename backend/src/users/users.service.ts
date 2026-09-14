import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionAudit, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { CreerUtilisateurDto, ModifierUtilisateurDto } from './dto/user.dto';

const SELECTION_PUBLIQUE = {
  id: true, email: true, nom: true, prenoms: true, telephone: true, role: true,
  centreId: true, mairieId: true, actif: true, doitChangerMotDePasse: true,
  derniereConnexion: true, createdAt: true,
  centre: { select: { id: true, nom: true, code: true } },
  mairie: { select: { id: true, nom: true, code: true } },
} satisfies Prisma.UserSelect;

const ROLES_CENTRE: Role[] = [Role.PERSONNEL_SANTE, Role.CHEF_CENTRE];
const ROLES_MAIRIE: Role[] = [Role.OFFICIER_ETAT_CIVIL, Role.SECRETAIRE_MAIRIE];

type Rattachement = { role: Role; centreId?: string | null; mairieId?: string | null };

/**
 * Regles de gestion des comptes :
 *  - ADMIN_NATIONAL cree tout type de compte.
 *  - CHEF_CENTRE ne cree/modifie que des PERSONNEL_SANTE de son centre.
 *  - OFFICIER_ETAT_CIVIL ne cree/modifie que des SECRETAIRE_MAIRIE de sa mairie.
 *  - Seul ADMIN_NATIONAL change un role, un rattachement ou une adresse de connexion.
 *  - Jamais de suppression physique : desactivation uniquement.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private verifierPerimetre(acteur: UtilisateurCourant, cible: Rattachement) {
    if (acteur.role === Role.ADMIN_NATIONAL) return;
    if (acteur.role === Role.CHEF_CENTRE) {
      if (cible.role !== Role.PERSONNEL_SANTE || cible.centreId !== acteur.centreId) {
        throw new ForbiddenException('Un chef de centre ne gere que le personnel de son centre');
      }
      return;
    }
    if (acteur.role === Role.OFFICIER_ETAT_CIVIL) {
      if (cible.role !== Role.SECRETAIRE_MAIRIE || cible.mairieId !== acteur.mairieId) {
        throw new ForbiddenException("Un officier ne gere que les secretaires de sa mairie");
      }
      return;
    }
    throw new ForbiddenException();
  }

  /** Un compte porte exactement le rattachement que son role exige, et aucun autre. */
  private validerRattachement(r: Rattachement) {
    if (ROLES_CENTRE.includes(r.role)) {
      if (!r.centreId) throw new BadRequestException('centreId obligatoire pour ce role');
      if (r.mairieId) throw new BadRequestException("Un compte de centre de sante n'est pas rattache a une mairie");
    }
    if (ROLES_MAIRIE.includes(r.role)) {
      if (!r.mairieId) throw new BadRequestException('mairieId obligatoire pour ce role');
      if (r.centreId) throw new BadRequestException("Un compte de mairie n'est pas rattache a un centre de sante");
    }
    if (r.role === Role.ADMIN_NATIONAL && (r.centreId || r.mairieId)) {
      throw new BadRequestException("Un administrateur national n'est rattache ni a un centre ni a une mairie");
    }
  }

  async lister(acteur: UtilisateurCourant) {
    const where: Prisma.UserWhereInput =
      acteur.role === Role.ADMIN_NATIONAL ? {}
      : acteur.role === Role.CHEF_CENTRE ? { centreId: acteur.centreId }
      : acteur.role === Role.OFFICIER_ETAT_CIVIL ? { mairieId: acteur.mairieId }
      : { id: acteur.id };
    return this.prisma.user.findMany({ where, select: SELECTION_PUBLIQUE, orderBy: [{ nom: 'asc' }] });
  }

  async creer(dto: CreerUtilisateurDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    this.validerRattachement(dto);
    this.verifierPerimetre(acteur, dto);

    const cree = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          motDePasseHash: await argon2.hash(dto.motDePasse),
          nom: dto.nom, prenoms: dto.prenoms, telephone: dto.telephone,
          role: dto.role, centreId: dto.centreId ?? null, mairieId: dto.mairieId ?? null,
          doitChangerMotDePasse: true,
        },
        select: SELECTION_PUBLIQUE,
      });
      if (dto.personnelSanteId) {
        const p = await tx.personnelSante.findUnique({ where: { id: dto.personnelSanteId } });
        if (!p || p.centreId !== dto.centreId) throw new BadRequestException('Fiche de personnel invalide pour ce centre');
        await tx.personnelSante.update({ where: { id: p.id }, data: { userId: user.id } });
      }
      await this.audit.journaliser({
        entite: 'User', entiteId: user.id, action: ActionAudit.CREATION_COMPTE, acteur,
        valeursApres: { email: user.email, role: user.role, centreId: user.centreId, mairieId: user.mairieId }, contexte: ctx,
      }, tx);
      return user;
    });
    return cree;
  }

  async modifier(id: string, dto: ModifierUtilisateurDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const existant = await this.prisma.user.findUnique({ where: { id } });
    if (!existant) throw new NotFoundException();
    this.verifierPerimetre(acteur, existant);

    // Role, rattachement et adresse de connexion etaient acceptes par la validation
    // puis ignores en silence : ils sont desormais appliques (administrateur) ou refuses.
    const email = dto.email?.toLowerCase().trim();
    const changeRole = dto.role !== undefined && dto.role !== existant.role;
    const changeCentre = dto.centreId !== undefined && dto.centreId !== existant.centreId;
    const changeMairie = dto.mairieId !== undefined && dto.mairieId !== existant.mairieId;
    const changeEmail = email !== undefined && email !== existant.email;
    const changeStructure = changeRole || changeCentre || changeMairie;

    if (acteur.role !== Role.ADMIN_NATIONAL && (changeStructure || changeEmail)) {
      throw new ForbiddenException("Seul l'administrateur national modifie le role, le rattachement ou l'adresse de connexion");
    }
    if (dto.personnelSanteId !== undefined) {
      throw new BadRequestException('La liaison a une fiche de personnel se fait a la creation du compte');
    }
    if (dto.actif === false && id === acteur.id) {
      throw new ForbiddenException('Impossible de desactiver son propre compte');
    }

    const cible: Rattachement = {
      role: dto.role ?? existant.role,
      centreId: changeCentre ? dto.centreId : existant.centreId,
      mairieId: changeMairie ? dto.mairieId : existant.mairieId,
    };
    if (changeStructure) this.validerRattachement(cible);
    if (changeEmail && (await this.prisma.user.findUnique({ where: { email: email! }, select: { id: true } }))) {
      throw new ConflictException('Adresse de connexion deja utilisee');
    }

    const data: Prisma.UserUncheckedUpdateInput = {
      nom: dto.nom, prenoms: dto.prenoms, telephone: dto.telephone,
      role: changeRole ? cible.role : undefined,
      centreId: changeCentre ? cible.centreId : undefined,
      mairieId: changeMairie ? cible.mairieId : undefined,
      email: changeEmail ? email : undefined,
      actif: dto.actif,
      desactiveLe: dto.actif === false ? new Date() : dto.actif === true ? null : undefined,
    };
    if (dto.motDePasse) {
      data.motDePasseHash = await argon2.hash(dto.motDePasse);
      data.doitChangerMotDePasse = true;
    }

    return this.prisma.$transaction(async (tx) => {
      const maj = await tx.user.update({ where: { id }, data, select: SELECTION_PUBLIQUE });

      // Une reinitialisation de mot de passe doit fermer les sessions existantes :
      // c'est precisement le geste attendu face a un compte compromis.
      if (dto.actif === false || dto.motDePasse) {
        await tx.refreshToken.updateMany({ where: { userId: id, revoqueLe: null }, data: { revoqueLe: new Date() } });
      }
      // Un compte qui quitte son centre ne reste pas lie a une fiche de personnel de ce centre
      if (changeCentre) {
        await tx.personnelSante.updateMany({
          where: { userId: id, ...(cible.centreId ? { centreId: { not: cible.centreId } } : {}) },
          data: { userId: null },
        });
      }

      await this.audit.journaliser({
        entite: 'User', entiteId: id,
        action: dto.actif === false ? ActionAudit.DESACTIVATION_COMPTE : ActionAudit.MODIFICATION,
        acteur,
        valeursAvant: { actif: existant.actif, role: existant.role, centreId: existant.centreId, mairieId: existant.mairieId, email: existant.email },
        valeursApres: { actif: maj.actif, role: maj.role, centreId: maj.centreId, mairieId: maj.mairieId, email: maj.email },
        metadonnees: dto.motDePasse ? { motDePasseReinitialise: true, sessionsRevoquees: true } : undefined,
        contexte: ctx,
      }, tx);
      return maj;
    });
  }
}
