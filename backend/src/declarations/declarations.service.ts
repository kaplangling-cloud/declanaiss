import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActionAudit, Declaration, Prisma, Role, StatutDeclaration, StatutRectification, TypePieceJointe } from '@prisma/client';
import { addDays } from 'date-fns';
import { PrismaService, TxClient } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { NumerotationService } from '../common/services/numerotation.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import {
  ActionSync, CreerDeclarationDto, DeclarationPayloadDto, DeciderRectificationDto, DemanderRectificationDto,
  ElementSyncDto, ListerDeclarationsDto, LotSyncDto, ModifierDeclarationDto,
} from './dto/declaration.dto';
import { validerPourSoumission } from './declarations.validation';
import { ParentDeclare, PdfDeclarationService } from './pdf-declaration.service';

const ROLES_CENTRE: Role[] = [Role.PERSONNEL_SANTE, Role.CHEF_CENTRE];
const ROLES_MAIRIE: Role[] = [Role.OFFICIER_ETAT_CIVIL, Role.SECRETAIRE_MAIRIE];
const CHAMPS_DATE = [
  'enfantDateNaissance', 'pereDateNaissance', 'pereCniDateDelivrance', 'mereDateNaissance', 'mereCniDateDelivrance',
] as const;
const MIME_AUTORISES = ['image/jpeg', 'image/png', 'application/pdf'];
/** Champs de CNI tels qu'ils circulent en clair dans l'API (chiffres au repos). */
const CHAMPS_CNI = ['pereCniNumero', 'mereCniNumero'] as const;

const INCLUDE_LISTE = {
  centre: { select: { id: true, code: true, nom: true } },
  mairie: { select: { id: true, code: true, nom: true } },
  accoucheur: { select: { id: true, nom: true, prenoms: true, fonction: true } },
  creePar: { select: { id: true, nom: true, prenoms: true } },
  acte: { select: { id: true, numeroActe: true, dateDressage: true } },
  _count: { select: { piecesJointes: true, rectifications: true } },
} satisfies Prisma.DeclarationInclude;

@Injectable()
export class DeclarationsService {
  private readonly logger = new Logger(DeclarationsService.name);
  private readonly fenetreJours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly numerotation: NumerotationService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly pdfDeclaration: PdfDeclarationService,
    config: ConfigService,
  ) {
    this.fenetreJours = config.get<number>('metier.modificationWindowDays') ?? 7;
  }

  // =====================================================================
  //  Perimetre et regles d'acces
  // =====================================================================

  /** Clause WHERE de cloisonnement : un centre ne voit jamais un autre centre,
   *  une mairie ne voit que les declarations qui lui sont adressees (et jamais les brouillons). */
  private perimetre(acteur: UtilisateurCourant): Prisma.DeclarationWhereInput {
    if (acteur.role === Role.ADMIN_NATIONAL) return {};
    if (ROLES_CENTRE.includes(acteur.role)) {
      if (!acteur.centreId) throw new ForbiddenException('Compte non rattache a un centre');
      return { centreId: acteur.centreId };
    }
    if (ROLES_MAIRIE.includes(acteur.role)) {
      if (!acteur.mairieId) throw new ForbiddenException('Compte non rattache a une mairie');
      return { mairieId: acteur.mairieId, statut: { not: StatutDeclaration.BROUILLON } };
    }
    throw new ForbiddenException();
  }

  private async charger(id: string, acteur: UtilisateurCourant, tx: TxClient = this.prisma) {
    const d = await tx.declaration.findFirst({ where: { id, ...this.perimetre(acteur) }, include: INCLUDE_LISTE });
    if (!d) throw new NotFoundException('Declaration introuvable');
    return d;
  }

  /** Une declaration est modifiable par le centre en brouillon, apres rejet,
   *  ou apres soumission tant que la fenetre de 7 jours n'est pas ecoulee. */
  private assurerModifiable(d: Declaration, acteur: UtilisateurCourant) {
    if (!ROLES_CENTRE.includes(acteur.role)) {
      throw new ForbiddenException('Seul le centre de sante peut modifier une declaration ; la mairie passe par une rectification');
    }
    if (d.statut === StatutDeclaration.BROUILLON || d.statut === StatutDeclaration.REJETEE) return;
    if (d.statut === StatutDeclaration.SOUMISE) {
      if (d.dateLimiteModification && d.dateLimiteModification > new Date()) return;
      throw new ForbiddenException({
        message: 'Fenetre de modification expiree : la declaration est verrouillee', code: 'FENETRE_EXPIREE',
      });
    }
    throw new ForbiddenException({ message: `Declaration ${d.statut.toLowerCase()} : non modifiable`, code: 'STATUT_NON_MODIFIABLE' });
  }

  // =====================================================================
  //  Mapping entree / sortie (chiffrement CNI)
  // =====================================================================

  private mapperEntree(p: DeclarationPayloadDto): Prisma.DeclarationUncheckedUpdateInput {
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      if (k === 'pereCniNumero') {
        data.pereCniNumeroChiffre = this.crypto.chiffrer(v as string);
        data.pereCniNumeroIndex = this.crypto.indexAveugle(v as string);
      } else if (k === 'mereCniNumero') {
        data.mereCniNumeroChiffre = this.crypto.chiffrer(v as string);
        data.mereCniNumeroIndex = this.crypto.indexAveugle(v as string);
      } else if ((CHAMPS_DATE as readonly string[]).includes(k)) {
        data[k] = v ? new Date(v as string) : null;
      } else if (k === 'donneesComplementaires') {
        data[k] = v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
      } else {
        data[k] = v;
      }
    }
    return data as Prisma.DeclarationUncheckedUpdateInput;
  }

  /** Dechiffre les CNI pour les roles habilites et journalise l'acces. */
  private async mapperSortie<T extends Declaration>(d: T, acteur: UtilisateurCourant, ctx?: ContexteRequete) {
    const { pereCniNumeroChiffre, mereCniNumeroChiffre, pereCniNumeroIndex, mereCniNumeroIndex, qrToken, ...reste } = d;
    const peutVoirCni = acteur.role !== Role.SECRETAIRE_MAIRIE;
    const sortie = {
      ...reste,
      pereCniNumero: peutVoirCni ? this.crypto.dechiffrer(pereCniNumeroChiffre) : (pereCniNumeroChiffre ? '••••' : null),
      mereCniNumero: peutVoirCni ? this.crypto.dechiffrer(mereCniNumeroChiffre) : (mereCniNumeroChiffre ? '••••' : null),
      modifiableJusquAu: d.dateLimiteModification,
    };
    if (ctx) {
      await this.audit.journaliserAcces({
        acteur, declarationId: d.id, contexte: ctx,
        champsSensibles: peutVoirCni ? ['pereCniNumero', 'mereCniNumero', 'poidsNaissanceGrammes'] : ['poidsNaissanceGrammes'],
      });
    }
    return sortie;
  }

  private nettoyerPourAudit(d: Partial<Declaration>) {
    const { pereCniNumeroChiffre, mereCniNumeroChiffre, pereCniNumeroIndex, mereCniNumeroIndex, qrToken, ...reste } = d;
    return reste;
  }

  /**
   * Les valeurs d'une rectification sont conservees en JSON : les CNI doivent y
   * etre chiffrees comme dans la declaration elle-meme.
   */
  private chiffrerCniValeurs(valeurs: Record<string, unknown>): Record<string, unknown> {
    const sortie = { ...valeurs };
    for (const c of CHAMPS_CNI) {
      if (typeof sortie[c] === 'string') sortie[c] = this.crypto.chiffrer(sortie[c] as string);
    }
    return sortie;
  }

  /** Inverse de chiffrerCniValeurs ; tolere une valeur anterieure enregistree en clair. */
  private dechiffrerCniValeurs(valeurs: Record<string, unknown>): Record<string, unknown> {
    const sortie = { ...valeurs };
    for (const c of CHAMPS_CNI) {
      const v = sortie[c];
      if (typeof v === 'string' && v.startsWith('v1:')) sortie[c] = this.crypto.dechiffrer(v);
    }
    return sortie;
  }

  /** Presente les CNI d'une rectification selon le role, comme mapperSortie le fait pour la declaration. */
  private presenterCni(valeurs: Prisma.JsonValue, peutVoir: boolean): Prisma.JsonValue {
    if (!valeurs || typeof valeurs !== 'object' || Array.isArray(valeurs)) return valeurs;
    const objet = valeurs as Record<string, unknown>;
    if (!CHAMPS_CNI.some((c) => objet[c] !== undefined && objet[c] !== null)) return valeurs;
    const sortie = this.dechiffrerCniValeurs(objet);
    if (!peutVoir) for (const c of CHAMPS_CNI) if (sortie[c]) sortie[c] = '••••';
    return sortie as unknown as Prisma.JsonValue;
  }

  // =====================================================================
  //  CRUD centre
  // =====================================================================

  async lister(f: ListerDeclarationsDto, acteur: UtilisateurCourant) {
    const page = f.page ?? 1;
    const taille = f.taille ?? 25;
    const where: Prisma.DeclarationWhereInput = {
      AND: [
        this.perimetre(acteur),
        f.statut ? { statut: f.statut } : {},
        f.centreId ? { centreId: f.centreId } : {},
        f.du || f.au ? { enfantDateNaissance: { gte: f.du ? new Date(f.du) : undefined, lte: f.au ? new Date(f.au) : undefined } } : {},
        f.recherche
          ? {
              OR: [
                { numeroDeclaration: { contains: f.recherche.toUpperCase() } },
                { enfantNom: { contains: f.recherche, mode: 'insensitive' } },
                { enfantPrenoms: { contains: f.recherche, mode: 'insensitive' } },
                { mereNom: { contains: f.recherche, mode: 'insensitive' } },
                { pereNom: { contains: f.recherche, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [total, lignes] = await this.prisma.$transaction([
      this.prisma.declaration.count({ where }),
      this.prisma.declaration.findMany({
        where, include: INCLUDE_LISTE, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * taille, take: taille,
        // Liste : jamais de CNI, meme chiffree
        omit: { pereCniNumeroChiffre: true, mereCniNumeroChiffre: true, pereCniNumeroIndex: true, mereCniNumeroIndex: true, qrToken: true },
      }),
    ]);
    return { total, page, taille, lignes };
  }

  async resume(acteur: UtilisateurCourant) {
    const base = this.perimetre(acteur);
    const groupes = await this.prisma.declaration.groupBy({ by: ['statut'], where: base, _count: { _all: true } });
    const parStatut = Object.fromEntries(groupes.map((g) => [g.statut, g._count._all]));
    const bientotVerrouillees = await this.prisma.declaration.count({
      where: { ...base, statut: StatutDeclaration.SOUMISE, dateLimiteModification: { lte: addDays(new Date(), 2), gt: new Date() } },
    });
    return { parStatut, bientotVerrouillees };
  }

  async obtenir(id: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const d = await this.prisma.declaration.findFirst({
      where: { id, ...this.perimetre(acteur) },
      include: {
        ...INCLUDE_LISTE,
        piecesJointes: { where: { supprimeLe: null }, select: { id: true, type: true, nomOriginal: true, mimeType: true, tailleOctets: true, createdAt: true } },
        rectifications: { orderBy: { createdAt: 'desc' }, include: { demandePar: { select: { nom: true, prenoms: true } }, decidePar: { select: { nom: true, prenoms: true } } } },
        soumisPar: { select: { nom: true, prenoms: true } },
        traitePar: { select: { nom: true, prenoms: true } },
      },
    });
    if (!d) throw new NotFoundException('Declaration introuvable');
    const peutVoirCni = acteur.role !== Role.SECRETAIRE_MAIRIE;
    const rectifications = d.rectifications.map((r) => ({
      ...r,
      valeursAvant: this.presenterCni(r.valeursAvant, peutVoirCni),
      valeursApres: this.presenterCni(r.valeursApres, peutVoirCni),
    }));
    return this.mapperSortie({ ...d, rectifications }, acteur, ctx);
  }

  async creer(dto: CreerDeclarationDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (!ROLES_CENTRE.includes(acteur.role) || !acteur.centreId) throw new ForbiddenException('Seul un centre de sante cree une declaration');
    const { clientUuid, saisieLe, ...payload } = dto;

    // Idempotence : un clientUuid deja connu renvoie l'existant (rejeu reseau)
    const existante = await this.prisma.declaration.findUnique({ where: { clientUuid } });
    if (existante) {
      if (existante.centreId !== acteur.centreId) throw new ConflictException('clientUuid deja utilise par un autre centre');
      return this.mapperSortie(existante, acteur);
    }

    const centre = await this.prisma.centre.findUniqueOrThrow({ where: { id: acteur.centreId }, select: { id: true, mairieId: true, actif: true } });
    if (!centre.actif) throw new ForbiddenException('Centre desactive');

    return this.prisma.$transaction(async (tx) => {
      await this.verifierAccoucheur(tx, payload.personnelAccoucheurId, centre.id);
      const d = await tx.declaration.create({
        data: {
          ...(this.mapperEntree(payload) as Prisma.DeclarationUncheckedCreateInput),
          clientUuid, centreId: centre.id, mairieId: centre.mairieId, creeParId: acteur.id,
          qrToken: this.crypto.tokenOpaque(24), saisieLe: saisieLe ? new Date(saisieLe) : null, synchroniseLe: new Date(),
        },
      });
      await this.audit.journaliser({ entite: 'Declaration', entiteId: d.id, declarationId: d.id, action: ActionAudit.CREATION, acteur, valeursApres: this.nettoyerPourAudit(d), contexte: ctx }, tx);
      return this.mapperSortie(d, acteur);
    });
  }

  async modifier(id: string, dto: ModifierDeclarationDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const { version, ...payload } = dto;
    return this.prisma.$transaction(async (tx) => {
      const avant = await this.charger(id, acteur, tx);
      this.assurerModifiable(avant, acteur);
      if (avant.version !== version) {
        throw new ConflictException({ message: 'La declaration a ete modifiee entre-temps', code: 'CONFLIT_VERSION', versionServeur: avant.version });
      }
      await this.verifierAccoucheur(tx, payload.personnelAccoucheurId, avant.centreId);
      const apres = await tx.declaration.update({
        where: { id }, data: { ...this.mapperEntree(payload), version: { increment: 1 } },
      });
      await this.audit.journaliser({
        entite: 'Declaration', entiteId: id, declarationId: id, action: ActionAudit.MODIFICATION, acteur,
        valeursAvant: this.nettoyerPourAudit(avant), valeursApres: this.nettoyerPourAudit(apres), contexte: ctx,
      }, tx);
      return this.mapperSortie(apres, acteur);
    });
  }

  private async verifierAccoucheur(tx: TxClient, personnelId: string | undefined, centreId: string) {
    if (!personnelId) return;
    const p = await tx.personnelSante.findFirst({ where: { id: personnelId, centreId, habilite: true } });
    if (!p) throw new BadRequestException("Le personnel indique n'est pas habilite dans ce centre");
  }

  // =====================================================================
  //  Cycle de vie
  // =====================================================================

  async soumettre(id: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (!ROLES_CENTRE.includes(acteur.role)) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const d = await this.charger(id, acteur, tx);
      if (!([StatutDeclaration.BROUILLON, StatutDeclaration.REJETEE, StatutDeclaration.SOUMISE] as StatutDeclaration[]).includes(d.statut)) {
        throw new ForbiddenException({ message: `Statut ${d.statut} : soumission impossible`, code: 'STATUT_NON_MODIFIABLE' });
      }
      if (d.statut === StatutDeclaration.SOUMISE) return this.mapperSortie(d, acteur); // idempotent

      validerPourSoumission({
        ...d,
        pereCniNumero: this.crypto.dechiffrer(d.pereCniNumeroChiffre),
        mereCniNumero: this.crypto.dechiffrer(d.mereCniNumeroChiffre),
      });

      const centre = await tx.centre.findUniqueOrThrow({ where: { id: d.centreId }, include: { region: true } });
      const maintenant = new Date();
      const premiereSoumission = !d.numeroDeclaration;

      const numero = premiereSoumission
        ? await this.numerotation.attribuerNumero(tx, {
            centreId: centre.id, codeRegion: centre.region.code, codeCentre: centre.code, annee: maintenant.getFullYear(),
          })
        : null;

      const apres = await tx.declaration.update({
        where: { id },
        data: {
          statut: StatutDeclaration.SOUMISE,
          // Mairie destinataire fixee a la premiere soumission, d'apres le rattachement
          // actuel du centre : un brouillon saisi avant un changement de rattachement
          // partait sinon a l'ancienne mairie.
          mairieId: premiereSoumission ? centre.mairieId : undefined,
          numeroDeclaration: numero?.numeroDeclaration ?? undefined,
          cleControle: numero?.cleControle ?? undefined,
          dateSoumission: premiereSoumission ? maintenant : undefined,
          // Fenetre : 7 jours apres la soumission initiale. Apres un rejet, la mairie a
          // explicitement demande une correction : nouvelle fenetre a partir de la re-soumission.
          dateLimiteModification: addDays(maintenant, this.fenetreJours),
          soumisParId: acteur.id, motifRejet: null, dateRejet: null, version: { increment: 1 },
        },
      });
      await this.audit.journaliser({
        entite: 'Declaration', entiteId: id, declarationId: id, action: ActionAudit.SOUMISSION, acteur,
        metadonnees: { numeroDeclaration: apres.numeroDeclaration, premiereSoumission, dateLimiteModification: apres.dateLimiteModification }, contexte: ctx,
      }, tx);
      return this.mapperSortie(apres, acteur);
    });
  }

  async valider(id: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (acteur.role !== Role.OFFICIER_ETAT_CIVIL) throw new ForbiddenException("Seul un officier d'etat civil valide une declaration");
    return this.prisma.$transaction(async (tx) => {
      const d = await this.charger(id, acteur, tx);
      if (!([StatutDeclaration.SOUMISE, StatutDeclaration.VERROUILLEE] as StatutDeclaration[]).includes(d.statut)) {
        throw new ForbiddenException(`Statut ${d.statut} : validation impossible`);
      }
      const apres = await tx.declaration.update({
        where: { id },
        data: { statut: StatutDeclaration.VALIDEE, dateValidation: new Date(), traiteParId: acteur.id, version: { increment: 1 } },
      });
      await this.audit.journaliser({ entite: 'Declaration', entiteId: id, declarationId: id, action: ActionAudit.VALIDATION, acteur, contexte: ctx }, tx);
      return this.mapperSortie(apres, acteur);
    });
  }

  async rejeter(id: string, motif: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (acteur.role !== Role.OFFICIER_ETAT_CIVIL) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const d = await this.charger(id, acteur, tx);
      if (!([StatutDeclaration.SOUMISE, StatutDeclaration.VERROUILLEE] as StatutDeclaration[]).includes(d.statut)) {
        throw new ForbiddenException(`Statut ${d.statut} : rejet impossible`);
      }
      const apres = await tx.declaration.update({
        where: { id },
        data: { statut: StatutDeclaration.REJETEE, motifRejet: motif, dateRejet: new Date(), traiteParId: acteur.id, version: { increment: 1 } },
      });
      await this.audit.journaliser({ entite: 'Declaration', entiteId: id, declarationId: id, action: ActionAudit.REJET, acteur, metadonnees: { motif }, contexte: ctx }, tx);
      return this.mapperSortie(apres, acteur);
    });
  }

  /** Appele par le job planifie. Verrouille en lot, avec trace d'audit par dossier. */
  async verrouillerExpirees(): Promise<number> {
    const aVerrouiller = await this.prisma.declaration.findMany({
      where: { statut: StatutDeclaration.SOUMISE, dateLimiteModification: { lte: new Date() } },
      select: { id: true, numeroDeclaration: true },
    });
    let n = 0;
    for (const d of aVerrouiller) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const r = await tx.declaration.updateMany({
            where: { id: d.id, statut: StatutDeclaration.SOUMISE },
            data: { statut: StatutDeclaration.VERROUILLEE, dateVerrouillage: new Date(), version: { increment: 1 } },
          });
          if (r.count === 1) {
            await this.audit.journaliser({ entite: 'Declaration', entiteId: d.id, declarationId: d.id, action: ActionAudit.VERROUILLAGE, metadonnees: { source: 'job', numeroDeclaration: d.numeroDeclaration } }, tx);
            n++;
          }
        });
      } catch (e) {
        this.logger.error(`Verrouillage impossible pour ${d.id}: ${(e as Error).message}`);
      }
    }
    return n;
  }

  // =====================================================================
  //  Synchronisation hors-ligne
  // =====================================================================

  async synchroniser(lot: LotSyncDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (!ROLES_CENTRE.includes(acteur.role) || !acteur.centreId) throw new ForbiddenException();
    const resultats: Array<Record<string, unknown>> = [];
    // Traitement sequentiel : chaque element dans sa propre transaction ; un echec n'annule pas les autres.
    for (const el of lot.elements) {
      try {
        resultats.push(await this.synchroniserElement(el, acteur, ctx));
      } catch (e) {
        const err = e as any;
        resultats.push({ clientUuid: el.clientUuid, resultat: 'ERREUR', message: err?.response?.message ?? err?.message ?? 'Erreur', erreurs: err?.response?.erreurs });
      }
    }
    return { resultats, horodatageServeur: new Date().toISOString() };
  }

  private async synchroniserElement(el: ElementSyncDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const existante = await this.prisma.declaration.findUnique({ where: { clientUuid: el.clientUuid } });

    let d: Awaited<ReturnType<typeof this.mapperSortie>>;
    let resultat: 'CREEE' | 'MISE_A_JOUR' | 'CONFLIT' | 'INCHANGEE';

    if (!existante) {
      d = await this.creer({ ...el.payload, clientUuid: el.clientUuid, saisieLe: el.saisieLe }, acteur, ctx);
      resultat = 'CREEE';
    } else {
      if (existante.centreId !== acteur.centreId) throw new ForbiddenException('Declaration d\'un autre centre');

      const modifiable = ([StatutDeclaration.BROUILLON, StatutDeclaration.REJETEE] as StatutDeclaration[]).includes(existante.statut)
        || (existante.statut === StatutDeclaration.SOUMISE && !!existante.dateLimiteModification && existante.dateLimiteModification > new Date());

      // versionBase 0 : le poste n'a jamais recu de version serveur. Si la copie serveur
      // est restee a sa version initiale, elle provient de ce meme poste (le clientUuid
      // lui est propre) — typiquement un envoi cree puis refuse a la soumission. Ce
      // n'est pas un conflit : sans cela, renvoyer le dossier corrige en signalait un.
      const versionBase = el.versionBase === 0 && existante.version === 1 ? 1 : el.versionBase;
      if (existante.version !== versionBase && !(el.forcer && existante.statut === StatutDeclaration.BROUILLON)) {
        // Double saisie / modification concurrente : on renvoie l'etat serveur, le client arbitre.
        return {
          clientUuid: el.clientUuid, resultat: 'CONFLIT' as const, id: existante.id, version: existante.version,
          statut: existante.statut, serveur: await this.mapperSortie(existante, acteur),
          message: existante.statut === StatutDeclaration.BROUILLON
            ? 'Version serveur plus recente. Renvoyez avec forcer=true pour ecraser, ou reprenez la version serveur.'
            : 'La declaration a evolue cote serveur et ne peut plus etre ecrasee.',
        };
      }
      if (!modifiable) {
        return { clientUuid: el.clientUuid, resultat: 'INCHANGEE' as const, id: existante.id, version: existante.version, statut: existante.statut, message: `Declaration ${existante.statut.toLowerCase()} : modifications locales ignorees` };
      }
      d = await this.modifier(existante.id, { ...el.payload, version: existante.version }, acteur, ctx);
      resultat = 'MISE_A_JOUR';
    }

    if (el.action === ActionSync.SOUMETTRE && d.statut !== StatutDeclaration.SOUMISE) {
      d = await this.soumettre(d.id, acteur, ctx);
    }
    return { clientUuid: el.clientUuid, resultat, id: d.id, version: d.version, statut: d.statut, numeroDeclaration: d.numeroDeclaration };
  }

  // =====================================================================
  //  Declaration imprimable (remise aux parents pour la mairie)
  // =====================================================================

  /**
   * PDF de la declaration, genere a la demande : aucune copie n'est stockee,
   * le document reflete donc toujours l'etat courant du dossier.
   * Un brouillon n'est pas imprimable : sans numero, il ne prouve rien.
   */
  async genererPdf(id: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const d = await this.prisma.declaration.findFirst({
      where: { id, ...this.perimetre(acteur) },
      include: {
        // En-tete : rattachement administratif du CENTRE DE SANTE (et non de la mairie)
        centre: { include: { region: true, departement: true, arrondissement: true } },
        mairie: { select: { nom: true } },
        accoucheur: true,
        acte: { select: { numeroActe: true, annuleLe: true } },
      },
    });
    if (!d) throw new NotFoundException('Declaration introuvable');
    if (d.statut === StatutDeclaration.BROUILLON || !d.numeroDeclaration) {
      throw new BadRequestException({
        message: "La declaration doit etre soumise a la mairie avant d'etre imprimee",
        code: 'DECLARATION_NON_SOUMISE',
      });
    }

    // Les CNI suivent la meme regle qu'a l'ecran : masquees pour un secretaire de mairie
    const peutVoirCni = acteur.role !== Role.SECRETAIRE_MAIRIE;
    const source = d as unknown as Record<string, unknown>;
    const parent = (p: 'pere' | 'mere'): ParentDeclare => {
      const chiffre = source[`${p}CniNumeroChiffre`] as string | null;
      return {
        nom: source[`${p}Nom`] as string | null,
        prenoms: source[`${p}Prenoms`] as string | null,
        dateNaissance: source[`${p}DateNaissance`] as Date | null,
        lieuNaissance: source[`${p}LieuNaissance`] as string | null,
        domicile: source[`${p}Domicile`] as string | null,
        profession: source[`${p}Profession`] as string | null,
        nationalite: source[`${p}Nationalite`] as string | null,
        cniNumero: peutVoirCni ? this.crypto.dechiffrer(chiffre) : (chiffre ? '••••' : null),
        cniDateDelivrance: source[`${p}CniDateDelivrance`] as Date | null,
      };
    };

    const declarant = d.declarantEstPersonnel
      ? `${d.accoucheur?.prenoms ?? ''} ${d.accoucheur?.nom ?? ''} (${d.accoucheur?.fonction ?? 'personnel de sante'}, ${d.centre.nom})`.trim()
      : `${d.declarantPrenoms ?? ''} ${d.declarantNom ?? ''} (${d.declarantQualite ?? ''})`.trim();

    const pdf = await this.pdfDeclaration.generer({
      numeroDeclaration: d.numeroDeclaration, qrToken: d.qrToken, statut: d.statut,
      dateSoumission: d.dateSoumission, dateLimiteModification: d.dateLimiteModification,
      numeroActe: d.acte && !d.acte.annuleLe ? d.acte.numeroActe : null,
      region: { fr: d.centre.region.nom, en: d.centre.region.nomEn ?? d.centre.region.nom },
      departement: { fr: d.centre.departement.nom, en: d.centre.departement.nomEn ?? d.centre.departement.nom },
      arrondissement: { fr: d.centre.arrondissement.nom, en: d.centre.arrondissement.nomEn ?? d.centre.arrondissement.nom },
      centre: {
        nom: d.centre.nom, numeroAutorisation: d.centre.numeroAutorisation, adresse: d.centre.adresse,
        chefNom: d.centre.chefNom, chefFonction: d.centre.chefFonction,
      },
      mairie: d.mairie.nom,
      enfantNom: d.enfantNom ?? '', enfantPrenoms: d.enfantPrenoms ?? '', enfantSexe: d.enfantSexe,
      enfantDateNaissance: d.enfantDateNaissance, enfantHeureNaissance: d.enfantHeureNaissance,
      modeAccouchement: d.modeAccouchement, termeGrossesse: d.termeGrossesse, moisGrossesse: d.moisGrossesse,
      poidsNaissanceGrammes: d.poidsNaissanceGrammes,
      pere: parent('pere'), mere: parent('mere'),
      accoucheur: d.accoucheur
        ? { nom: `${d.accoucheur.prenoms} ${d.accoucheur.nom}`.trim(), fonction: d.accoucheur.fonction, numeroOrdre: d.accoucheur.numeroOrdre }
        : null,
      declarant, declarantContact: d.declarantContact, editeLe: new Date(),
    });

    // Un document quitte le systeme : trace d'audit, en plus du journal des acces
    await this.audit.journaliser({
      entite: 'Declaration', entiteId: d.id, declarationId: d.id, action: ActionAudit.EXPORT, acteur,
      metadonnees: { document: 'declaration-pdf', numeroDeclaration: d.numeroDeclaration, statut: d.statut }, contexte: ctx,
    });
    await this.audit.journaliserAcces({
      acteur, declarationId: d.id, contexte: ctx,
      champsSensibles: peutVoirCni
        ? ['pereCniNumero', 'mereCniNumero', 'poidsNaissanceGrammes']
        : ['poidsNaissanceGrammes'],
    });

    return { pdf, nom: `declaration-${d.numeroDeclaration}.pdf` };
  }

  // =====================================================================
  //  Pieces jointes
  // =====================================================================

  async ajouterPiece(id: string, type: TypePieceJointe, fichier: { originalname: string; mimetype: string; size: number; buffer: Buffer }, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (!MIME_AUTORISES.includes(fichier.mimetype)) throw new BadRequestException('Format accepte : JPEG, PNG ou PDF');
    const d = await this.charger(id, acteur);
    this.assurerModifiable(d, acteur);
    const nomSur = fichier.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const { relatif, sha256 } = await this.storage.ecrirePieceChiffree(d.id, nomSur, fichier.buffer);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.pieceJointe.create({
        data: { declarationId: d.id, type, nomOriginal: fichier.originalname.slice(0, 200), cheminStockage: relatif, mimeType: fichier.mimetype, tailleOctets: fichier.size, sha256, televerseParId: acteur.id },
        select: { id: true, type: true, nomOriginal: true, mimeType: true, tailleOctets: true, createdAt: true },
      });
      await this.audit.journaliser({ entite: 'PieceJointe', entiteId: p.id, declarationId: d.id, action: ActionAudit.CREATION, acteur, metadonnees: { type, sha256 }, contexte: ctx }, tx);
      return p;
    });
  }

  async telechargerPiece(id: string, pieceId: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const d = await this.charger(id, acteur);
    const p = await this.prisma.pieceJointe.findFirst({ where: { id: pieceId, declarationId: d.id, supprimeLe: null } });
    if (!p) throw new NotFoundException('Piece introuvable');
    const contenu = await this.storage.lirePieceChiffree(p.cheminStockage);
    if (this.crypto.sha256(contenu) !== p.sha256) throw new ConflictException('Integrite de la piece compromise');
    await this.audit.journaliserAcces({ acteur, declarationId: d.id, contexte: ctx, champsSensibles: [`pieceJointe:${p.type}`] });
    return { contenu, mimeType: p.mimeType, nom: p.nomOriginal };
  }

  async retirerPiece(id: string, pieceId: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const d = await this.charger(id, acteur);
    this.assurerModifiable(d, acteur);
    // La piece doit appartenir a la declaration du perimetre : sans ce filtre,
    // l'identifiant d'une piece d'un autre dossier — voire d'un autre centre — etait accepte.
    const piece = await this.prisma.pieceJointe.findFirst({
      where: { id: pieceId, declarationId: d.id, supprimeLe: null },
      select: { id: true },
    });
    if (!piece) throw new NotFoundException('Piece introuvable');
    return this.prisma.$transaction(async (tx) => {
      await tx.pieceJointe.update({ where: { id: piece.id }, data: { supprimeLe: new Date() } });
      await this.audit.journaliser({ entite: 'PieceJointe', entiteId: pieceId, declarationId: d.id, action: ActionAudit.MODIFICATION, acteur, metadonnees: { supprimee: true }, contexte: ctx }, tx);
      return { ok: true };
    });
  }

  // =====================================================================
  //  Rectification (initiee par la mairie, tracee, seule voie apres verrouillage)
  // =====================================================================

  async demanderRectification(id: string, dto: DemanderRectificationDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (acteur.role !== Role.OFFICIER_ETAT_CIVIL && acteur.role !== Role.ADMIN_NATIONAL) throw new ForbiddenException('Une rectification est initiee par la mairie');
    const d = await this.charger(id, acteur);
    if (!([StatutDeclaration.VERROUILLEE, StatutDeclaration.VALIDEE] as StatutDeclaration[]).includes(d.statut)) {
      throw new BadRequestException('La rectification ne concerne que les declarations verrouillees ou validees');
    }
    // Chaque champ cible doit recevoir une nouvelle valeur. valeursApres etant valide
    // contre le DTO de declaration, la regle borne aussi les champs rectifiables aux
    // seules donnees de la declaration.
    const valeursProposees = { ...dto.valeursApres } as Record<string, unknown>;
    const cibles = [...new Set(dto.champsCibles)];
    if (!cibles.length) throw new BadRequestException('Au moins un champ a rectifier est requis');
    const sansValeur = cibles.filter((c) => valeursProposees[c] === undefined);
    if (sansValeur.length) {
      throw new BadRequestException({ message: 'Chaque champ cible doit recevoir une nouvelle valeur', code: 'CHAMPS_SANS_VALEUR', champs: sansValeur });
    }

    // Les CNI ne sont jamais conservees en clair : valeur avant reprise sous sa forme
    // chiffree, valeur apres chiffree avant enregistrement.
    const actuel = d as unknown as Record<string, unknown>;
    const valeursAvant = Object.fromEntries(
      cibles.map((c) => [c, (CHAMPS_CNI as readonly string[]).includes(c) ? actuel[`${c}Chiffre`] ?? null : actuel[c] ?? null]),
    );
    const valeursApres = this.chiffrerCniValeurs(Object.fromEntries(cibles.map((c) => [c, valeursProposees[c]])));
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.rectification.create({
        data: {
          declarationId: d.id, motif: dto.motif, champsCibles: cibles, referenceLegale: dto.referenceLegale,
          valeursAvant: valeursAvant as unknown as Prisma.InputJsonValue,
          valeursApres: valeursApres as unknown as Prisma.InputJsonValue,
          demandeParId: acteur.id,
        },
      });
      await this.audit.journaliser({ entite: 'Rectification', entiteId: r.id, declarationId: d.id, action: ActionAudit.RECTIFICATION, acteur, metadonnees: { statut: r.statut, motif: dto.motif }, contexte: ctx }, tx);
      return r;
    });
  }

  async deciderRectification(id: string, rectifId: string, dto: DeciderRectificationDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (acteur.role !== Role.OFFICIER_ETAT_CIVIL && acteur.role !== Role.ADMIN_NATIONAL) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const d = await this.charger(id, acteur, tx);
      const r = await tx.rectification.findFirst({ where: { id: rectifId, declarationId: d.id } });
      if (!r) throw new NotFoundException('Rectification introuvable');
      if (r.statut !== StatutRectification.DEMANDEE) throw new BadRequestException('Rectification deja traitee');

      if (!dto.approuver) {
        const refusee = await tx.rectification.update({ where: { id: r.id }, data: { statut: StatutRectification.REFUSEE, decideParId: acteur.id, decideLe: new Date(), commentaireDecision: dto.commentaire } });
        await this.audit.journaliser({ entite: 'Rectification', entiteId: r.id, declarationId: d.id, action: ActionAudit.RECTIFICATION, acteur, metadonnees: { statut: 'REFUSEE' }, contexte: ctx }, tx);
        return refusee;
      }

      // Application : uniquement les champs cibles declares
      const valeursApres = this.dechiffrerCniValeurs((r.valeursApres ?? {}) as Record<string, unknown>);
      const payload: Record<string, unknown> = {};
      for (const c of r.champsCibles) if (c in valeursApres) payload[c] = valeursApres[c];

      // Une rectification ne peut pas rendre la declaration incoherente : les regles de
      // la soumission s'appliquent a l'etat qui resulterait de son application.
      validerPourSoumission({
        ...d,
        pereCniNumero: this.crypto.dechiffrer(d.pereCniNumeroChiffre),
        mereCniNumero: this.crypto.dechiffrer(d.mereCniNumeroChiffre),
        ...payload,
      } as Parameters<typeof validerPourSoumission>[0]);

      const apres = await tx.declaration.update({ where: { id: d.id }, data: { ...this.mapperEntree(payload as DeclarationPayloadDto), version: { increment: 1 } } });
      const appliquee = await tx.rectification.update({ where: { id: r.id }, data: { statut: StatutRectification.APPLIQUEE, decideParId: acteur.id, decideLe: new Date(), appliqueeLe: new Date(), commentaireDecision: dto.commentaire } });
      await this.audit.journaliser({
        entite: 'Declaration', entiteId: d.id, declarationId: d.id, action: ActionAudit.RECTIFICATION, acteur,
        valeursAvant: r.valeursAvant, valeursApres: payload, metadonnees: { rectificationId: r.id, referenceLegale: r.referenceLegale }, contexte: ctx,
      }, tx);
      void apres;
      return appliquee;
    });
  }
}
