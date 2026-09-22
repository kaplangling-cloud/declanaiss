import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActionAudit, Prisma, Role, StatutDeclaration } from '@prisma/client';
import { format } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { NumerotationService } from '../common/services/numerotation.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { ContexteRequete, UtilisateurCourant } from '../common/decorators';
import { PdfActeService } from './pdf-acte.service';
import { EditerActeDto } from './dto/acte.dto';

const INCLUDE_ACTE = {
  declaration: { select: { id: true, numeroDeclaration: true, enfantNom: true, enfantPrenoms: true, enfantDateNaissance: true, centre: { select: { nom: true, code: true } } } },
  officier: { select: { nom: true, prenoms: true } },
} satisfies Prisma.ActeInclude;

@Injectable()
export class ActesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly numerotation: NumerotationService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly pdf: PdfActeService,
  ) {}

  private perimetre(acteur: UtilisateurCourant): Prisma.ActeWhereInput {
    if (acteur.role === Role.ADMIN_NATIONAL) return {};
    if (acteur.mairieId) return { mairieId: acteur.mairieId };
    if (acteur.centreId) return { declaration: { centreId: acteur.centreId } };
    throw new ForbiddenException();
  }

  lister(acteur: UtilisateurCourant, annee?: number) {
    return this.prisma.acte.findMany({
      where: { ...this.perimetre(acteur), anneeRegistre: annee },
      include: INCLUDE_ACTE, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  async obtenir(id: string, acteur: UtilisateurCourant) {
    const a = await this.prisma.acte.findFirst({ where: { id, ...this.perimetre(acteur) }, include: INCLUDE_ACTE });
    if (!a) throw new NotFoundException('Acte introuvable');
    return a;
  }

  /**
   * Edition finale de l'acte par l'officier d'etat civil :
   * transaction unique = numero d'acte + enregistrement + PDF + audit.
   */
  async editer(declarationId: string, dto: EditerActeDto, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    if (acteur.role !== Role.OFFICIER_ETAT_CIVIL) throw new ForbiddenException("Seul un officier d'etat civil edite un acte");

    const d = await this.prisma.declaration.findFirst({
      where: { id: declarationId, mairieId: acteur.mairieId ?? '' },
      include: {
        centre: { include: { arrondissement: true } },
        // L'en-tete de l'acte porte le rattachement de la MAIRIE qui le dresse
        mairie: { include: { region: true, departement: true, arrondissement: true } },
        acte: true,
        accoucheur: true,
      },
    });
    if (!d) throw new NotFoundException('Declaration introuvable');
    if (d.acte) throw new BadRequestException({ message: 'Un acte existe deja pour cette declaration', code: 'ACTE_EXISTANT', acteId: d.acte.id });
    if (d.statut !== StatutDeclaration.VALIDEE) throw new BadRequestException('La declaration doit etre validee avant edition de l\'acte');

    const pere = this.parent(d, 'pere');
    const mere = this.parent(d, 'mere');
    const declarant = d.declarantEstPersonnel
      ? `${d.accoucheur?.prenoms ?? ''} ${d.accoucheur?.nom ?? ''} (${d.accoucheur?.fonction ?? 'personnel de sante'}, ${d.centre.nom})`.trim()
      : `${d.declarantPrenoms ?? ''} ${d.declarantNom ?? ''} (${d.declarantQualite ?? ''})`.trim();

    // Le numero est pris dans le registre de l'annee en cours : une date de dressage
    // d'une autre annee, future ou anterieure a la naissance produirait un acte
    // dont la date contredit le numero de registre.
    const aujourdHui = format(new Date(), 'yyyy-MM-dd');
    const jourDressage = dto.dateDressage ? dto.dateDressage.slice(0, 10) : aujourdHui;
    if (jourDressage > aujourdHui) throw new BadRequestException('La date de dressage ne peut pas etre dans le futur');
    if (jourDressage.slice(0, 4) !== aujourdHui.slice(0, 4)) {
      throw new BadRequestException(`La date de dressage doit appartenir a l'annee du registre (${aujourdHui.slice(0, 4)})`);
    }
    if (d.enfantDateNaissance && jourDressage < d.enfantDateNaissance.toISOString().slice(0, 10)) {
      throw new BadRequestException('La date de dressage ne peut pas preceder la naissance');
    }

    return this.prisma.$transaction(async (tx) => {
      const annee = Number(aujourdHui.slice(0, 4));
      const numeroActe = await this.numerotation.attribuerNumeroActe(tx, { mairieId: d.mairieId, codeMairie: d.mairie.code, annee });
      const dateDressage = new Date(jourDressage);

      const acte = await tx.acte.create({
        data: {
          declarationId: d.id, mairieId: d.mairieId, numeroActe, anneeRegistre: annee, dateDressage,
          officierId: acteur.id, officierNomComplet: acteur.nomComplet, secretaireNomComplet: dto.secretaireNomComplet ?? null,
          mentionMarginale: dto.mentionMarginale ?? null,
        },
      });

      const pdfBuffer = await this.pdf.generer({
        numeroActe, numeroDeclaration: d.numeroDeclaration!, qrToken: d.qrToken, dateDressage, mentionMarginale: acte.mentionMarginale,
        // En-tete bilingue : denomination francaise et anglaise (RDC.xlsx)
        region: { fr: d.mairie.region.nom, en: d.mairie.region.nomEn ?? d.mairie.region.nom },
        departement: { fr: d.mairie.departement.nom, en: d.mairie.departement.nomEn ?? d.mairie.departement.nom },
        arrondissement: { fr: d.mairie.arrondissement.nom, en: d.mairie.arrondissement.nomEn ?? d.mairie.arrondissement.nom },
        mairie: d.mairie.nom,
        enfantNom: d.enfantNom!, enfantPrenoms: d.enfantPrenoms!, enfantSexe: d.enfantSexe!, enfantDateNaissance: d.enfantDateNaissance!,
        enfantHeureNaissance: d.enfantHeureNaissance!, lieuNaissance: `${d.centre.nom}, ${d.centre.arrondissement.nom}`,
        pere, mere, declarant, officier: acteur.nomComplet, secretaire: dto.secretaireNomComplet,
      });

      const { relatif, sha256 } = await this.storage.ecrireActePdf(acte.id, pdfBuffer);
      const final = await tx.acte.update({ where: { id: acte.id }, data: { cheminPdf: relatif, pdfSha256: sha256 }, include: INCLUDE_ACTE });

      await this.audit.journaliser({
        entite: 'Acte', entiteId: acte.id, declarationId: d.id, action: ActionAudit.EDITION_ACTE, acteur,
        metadonnees: { numeroActe, pdfSha256: sha256 }, contexte: ctx,
      }, tx);
      return final;
    }, { timeout: 30_000 });
  }

  async telechargerPdf(id: string, acteur: UtilisateurCourant, ctx: ContexteRequete) {
    const a = await this.obtenir(id, acteur);
    if (!a.cheminPdf) throw new NotFoundException('PDF non genere');
    const pdf = await this.storage.lireFichier(a.cheminPdf);
    if (this.crypto.sha256(pdf) !== a.pdfSha256) throw new BadRequestException('Integrite du PDF compromise');
    await this.prisma.$transaction(async (tx) => {
      await tx.acte.update({ where: { id }, data: { nbImpressions: { increment: 1 }, derniereImpression: new Date() } });
      await this.audit.journaliser({ entite: 'Acte', entiteId: id, declarationId: a.declarationId, action: ActionAudit.REIMPRESSION_ACTE, acteur, contexte: ctx }, tx);
    });
    return { pdf, nom: `acte-${a.numeroActe.replace(/\//g, '-')}.pdf` };
  }

  private parent(d: any, p: 'pere' | 'mere') {
    return {
      nom: d[`${p}Nom`], prenoms: d[`${p}Prenoms`], dateNaissance: d[`${p}DateNaissance`], lieuNaissance: d[`${p}LieuNaissance`],
      domicile: d[`${p}Domicile`], profession: d[`${p}Profession`], nationalite: d[`${p}Nationalite`],
      cniNumero: this.crypto.dechiffrer(d[`${p}CniNumeroChiffre`]) ?? '', cniDateDelivrance: d[`${p}CniDateDelivrance`],
    };
  }
}
