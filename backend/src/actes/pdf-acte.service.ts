import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as bwipjs from 'bwip-js';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { promises as fs } from 'fs';
import * as path from 'path';

/** Logo de l'application (src/assets en dev, dist/assets une fois compile). */
const CHEMIN_LOGO = path.join(__dirname, '..', 'assets', 'logo.png');

export interface DonneesActe {
  numeroActe: string;
  numeroDeclaration: string;
  qrToken: string;
  dateDressage: Date;
  mentionMarginale?: string | null;

  /** Rattachement administratif de la MAIRIE qui dresse l'acte (FR / EN). */
  region: Circonscription;
  departement: Circonscription;
  arrondissement: Circonscription;
  mairie: string;
  /** Centre principal de rattachement, si la mairie est un centre secondaire. */
  centreRattachement?: string | null;

  enfantNom: string;
  enfantPrenoms: string;
  enfantSexe: 'MASCULIN' | 'FEMININ';
  enfantDateNaissance: Date;
  enfantHeureNaissance: string;
  lieuNaissance: string;

  pere: Parent;
  mere: Parent;

  declarant: string;
  officier: string;
  secretaire?: string | null;
}

/** Denomination d'une circonscription dans les deux langues officielles. */
export interface Circonscription {
  fr: string;
  en: string;
}

interface Parent {
  nom: string;
  prenoms: string;
  dateNaissance: Date;
  lieuNaissance: string;
  domicile: string;
  profession: string;
  nationalite: string;
  cniNumero: string;
  cniDateDelivrance: Date;
}

const VERT = rgb(0.05, 0.42, 0.24);
const NOIR = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);

// Mise en page (points PDF, A4 595.28 x 841.89)
const M = 36; // marge
const TL = 8.2; // taille des libelles
const TV = 9.2; // taille des valeurs
const TS = 6.3; // taille des sous-libelles anglais
const INTERLIGNE = 13.6;

/**
 * Generation du PDF de l'acte de naissance (pdf-lib, sans navigateur).
 *
 * La mise en page reproduit le formulaire officiel camerounais bilingue
 * (modele A1 fourni en reference) : en-tete republicain sur deux colonnes
 * francais/anglais, rubriques "libelle FR - libelle EN" suivies d'une ligne
 * pointillee, dates ecrites en toutes lettres, bloc de cloture et signatures
 * de l'officier et du secretaire d'etat civil.
 *
 * S'y ajoutent les elements propres a la dematerialisation : QR code renvoyant
 * a la page publique de verification et code-barres Code 128 portant le numero
 * de declaration (lecture par douchette au guichet).
 */
@Injectable()
export class PdfActeService {
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.publicUrl = config.get<string>('publicUrl') || '';
  }

  async generer(d: DonneesActe): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Acte de naissance ${d.numeroActe}`);
    pdf.setSubject(`Declaration ${d.numeroDeclaration}`);
    pdf.setProducer('Declaration de naissance en ligne');
    pdf.setCreationDate(new Date());

    const page = pdf.addPage([595.28, 841.89]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const H = page.getHeight();
    const W = page.getWidth() - 2 * M;
    const XD = M + W; // bord droit du contenu
    let y = H - M;

    // ---------- Cadre ----------
    page.drawRectangle({ x: M - 8, y: M - 8, width: W + 16, height: H - 2 * M + 16, borderColor: VERT, borderWidth: 1.2 });
    page.drawRectangle({ x: M - 8, y: H - M + 4, width: W + 16, height: 4, color: VERT });

    // ---------- Logo et reference de la declaration ----------
    try {
      const logo = await pdf.embedPng(await fs.readFile(CHEMIN_LOGO));
      page.drawImage(logo, { x: M, y: H - M - 44, width: 42, height: 42 });
    } catch {
      /* logo absent : l'acte reste valide sans */
    }
    const refDecl = `Declaration n° ${d.numeroDeclaration}`;
    page.drawText(refDecl, { x: XD - regular.widthOfTextAtSize(refDecl, 6.5), y: H - M - 8, size: 6.5, font: regular, color: GRIS });

    // ---------- En-tete republicain (deux colonnes FR / EN) ----------
    y -= 20;
    const xColFr = M + 56;
    const demi = (W - 56) / 2;
    this.centre(page, 'REPUBLIQUE DU CAMEROUN', xColFr, demi, y, bold, 10, VERT);
    this.centre(page, 'REPUBLIC OF CAMEROON', xColFr + demi, demi, y, bold, 10, VERT);
    y -= 10;
    this.centre(page, 'Paix - Travail - Patrie', xColFr, demi, y, italic, 7, GRIS);
    this.centre(page, 'Peace - Work - Fatherland', xColFr + demi, demi, y, italic, 7, GRIS);

    // ---------- Region / Departement / Arrondissement ----------
    y -= 22;
    // Colonne gauche en francais, colonne droite en anglais, dans l'ordre
    // Region > Departement > Arrondissement du decoupage administratif.
    const rubriques: Array<[string, string, Circonscription]> = [
      ['REGION', 'REGION', d.region],
      ['DEPARTEMENT', 'DIVISION', d.departement],
      ['ARRONDISSEMENT', 'SUBDIVISION', d.arrondissement],
    ];
    for (const [labFr, labEn, valeur] of rubriques) {
      page.drawText(labFr, { x: xColFr, y, size: 7.5, font: bold, color: NOIR });
      page.drawText(labEn, { x: xColFr + demi, y, size: 7.5, font: bold, color: NOIR });
      this.valeurSurPointilles(page, valeur.fr, xColFr, demi - 14, y - 10, regular);
      this.valeurSurPointilles(page, valeur.en || valeur.fr, xColFr + demi, demi - 14, y - 10, regular);
      y -= 20;
    }

    // ---------- Centre d'etat civil ----------
    y -= 2;
    this.centre(page, "CENTRE D'ETAT CIVIL / CIVIL STATUS REGISTRATION CENTRE", M, W, y, bold, 8.5, NOIR);
    y -= 13;
    const largeurDe = bold.widthOfTextAtSize('de', TL) + regular.widthOfTextAtSize(' - of ', TL);
    page.drawText('de', { x: M + 4, y, size: TL, font: bold, color: NOIR });
    page.drawText(' - of ', { x: M + 4 + bold.widthOfTextAtSize('de', TL), y, size: TL, font: regular, color: NOIR });
    this.valeurSurPointilles(page, d.mairie, M + 4 + largeurDe, W - largeurDe - 8, y, bold);

    // ---------- Centre de rattachement (centres secondaires) ----------
    y -= 14;
    page.drawText("Centre d'état civil de rattachement", { x: M + 4, y, size: 7.2, font: bold, color: NOIR });
    page.drawText(' (pour les centres secondaires)', { x: M + 4 + bold.widthOfTextAtSize("Centre d'état civil de rattachement", 7.2), y, size: 7.2, font: regular, color: NOIR });
    y -= 8;
    page.drawText('Main Civil Status Registry of Attachment (for secondary civil status registry)', { x: M + 4, y, size: 6.3, font: italic, color: GRIS });
    y -= 11;
    this.valeurSurPointilles(page, d.centreRattachement ?? '', M + 4, W - 8, y, regular);

    // ---------- Titre ----------
    y -= 20;
    const t1 = 'ACTE DE NAISSANCE';
    const t2 = ' / BIRTH CERTIFICATE';
    const largeurTitre = bold.widthOfTextAtSize(t1, 16) + regular.widthOfTextAtSize(t2, 16);
    const xTitre = M + (W - largeurTitre) / 2;
    page.drawText(t1, { x: xTitre, y, size: 16, font: bold, color: VERT });
    page.drawText(t2, { x: xTitre + bold.widthOfTextAtSize(t1, 16), y, size: 16, font: regular, color: NOIR });
    y -= 14;
    const numero = `N° : ${d.numeroActe}`;
    this.centre(page, numero, M, W, y, bold, 11, NOIR);
    y -= 10;

    // ---------- Corps : rubriques du formulaire ----------
    /** Rubrique "Libelle FR - Libelle EN  <valeur sur pointilles>". */
    const rubrique = (labFr: string, labEn: string, valeur: string, opts: { gras?: boolean } = {}) => {
      let x = M + 4;
      page.drawText(labFr, { x, y, size: TL, font: bold, color: NOIR });
      x += bold.widthOfTextAtSize(labFr, TL);
      const sep = ` - ${labEn} `;
      page.drawText(sep, { x, y, size: TL, font: regular, color: NOIR });
      x += regular.widthOfTextAtSize(sep, TL);
      this.valeurSurPointilles(page, valeur, x, XD - 4 - x, y, opts.gras ? bold : regular);
      y -= INTERLIGNE;
    };

    /** Rubrique dont le libelle anglais est reporte sous le libelle francais. */
    const rubriqueEmpilee = (labFr: string, labEn: string, valeur: string) => {
      const x = M + 4;
      page.drawText(labFr, { x, y, size: TL, font: bold, color: NOIR });
      const xv = x + bold.widthOfTextAtSize(labFr, TL) + 4;
      this.valeurSurPointilles(page, valeur, xv, XD - 4 - xv, y, bold);
      page.drawText(labEn, { x, y: y - 7.5, size: TS, font: regular, color: GRIS });
      y -= INTERLIGNE + 6;
    };

    /** Renvoi explicatif sous "Document de reference". */
    const renvoi = () => {
      page.drawText(
        "(Numéro de la Carte Nationale d'Identité, ou références de l'acte de naissance, ou références du document prouvant la nationalité)",
        { x: M + 4, y: y + 4, size: 5.5, font: regular, color: GRIS },
      );
      page.drawText(
        '(National Identity Card Number, or references of the Birth Certificate, or References of the Document attesting the Nationality)',
        { x: M + 4, y: y - 3, size: 5.5, font: italic, color: GRIS },
      );
      y -= 13;
    };

    const docReference = (p: Parent) =>
      p.cniNumero ? `CNI N° ${p.cniNumero} du ${format(p.cniDateDelivrance, 'dd/MM/yyyy')}` : '';

    // Enfant
    rubriqueEmpilee("Nom de l'enfant :", 'Surname of the child', d.enfantNom.toUpperCase());
    rubriqueEmpilee("Prénoms de l'enfant :", 'Given name of the child', d.enfantPrenoms);
    rubrique('Né le', 'Born on the', `${this.dateEnLettres(d.enfantDateNaissance)} à ${d.enfantHeureNaissance}`);
    rubrique('A', 'At', d.lieuNaissance);
    rubrique('De sexe', 'Sex', d.enfantSexe === 'MASCULIN' ? 'Masculin / Male' : 'Féminin / Female');

    // Pere
    rubrique('De', 'Of', `${d.pere.nom.toUpperCase()} ${d.pere.prenoms}`, { gras: true });
    rubrique('Né à', 'Born at', d.pere.lieuNaissance);
    rubrique('Le', 'On the', this.dateEnLettres(d.pere.dateNaissance));
    rubrique('Domicilié à', 'Resident at', d.pere.domicile);
    rubrique('Profession', 'Occupation', d.pere.profession);
    rubrique('Nationalité', 'Nationality', d.pere.nationalite);
    rubrique('Document de référence', 'Reference document', docReference(d.pere));
    renvoi();

    // Mere
    rubrique('Et de', 'And of', `${d.mere.nom.toUpperCase()} ${d.mere.prenoms}`, { gras: true });
    rubrique('Née à', 'Born at', d.mere.lieuNaissance);
    rubrique('Le', 'On the', this.dateEnLettres(d.mere.dateNaissance));
    rubrique('Domiciliée à', 'Resident at', d.mere.domicile);
    rubrique('Profession', 'Occupation', d.mere.profession);
    rubrique('Nationalité', 'Nationality', d.mere.nationalite);
    rubrique('Document de référence', 'Reference document', docReference(d.mere));
    renvoi();

    // ---------- Cloture ----------
    y -= 4;
    rubrique('Dressé le', 'Drawn up on the', this.dateEnLettres(d.dateDressage));

    // "Sur la declaration de" se poursuit a la ligne suivante, comme sur le
    // formulaire papier, plutot que d'etre tronquee.
    {
      let x = M + 4;
      page.drawText('Sur la déclaration de', { x, y, size: TL, font: bold, color: NOIR });
      x += bold.widthOfTextAtSize('Sur la déclaration de', TL);
      const sep = ' - In accordance with the declaration of ';
      page.drawText(sep, { x, y, size: TL, font: regular, color: NOIR });
      x += regular.widthOfTextAtSize(sep, TL);

      const lignes = this.repartir(d.declarant, regular, TV, XD - 4 - x - 4, W - 12);
      this.valeurSurPointilles(page, lignes[0] ?? '', x, XD - 4 - x, y, regular);
      y -= INTERLIGNE;
      for (const suite of lignes.slice(1)) {
        this.valeurSurPointilles(page, suite, M + 4, W - 8, y, regular);
        y -= INTERLIGNE;
      }
    }

    page.drawText('Lesquels ont certifié la sincérité de la présente déclaration,', { x: M + 4, y, size: TL, font: bold, color: NOIR });
    y -= 8.5;
    page.drawText('Who attested to the truth of this declaration.', { x: M + 4, y, size: TS, font: italic, color: GRIS });
    y -= 12;

    /** "Par Nous / Assiste de" : qualite rappelee a droite et sur la ligne suivante. */
    const signataire = (labFr: string, labEn: string, nom: string, qualiteFr: string, qualiteEn: string) => {
      let x = M + 4;
      page.drawText(labFr, { x, y, size: TL, font: bold, color: NOIR });
      x += bold.widthOfTextAtSize(labFr, TL);
      const sep = ` - ${labEn} `;
      page.drawText(sep, { x, y, size: TL, font: regular, color: NOIR });
      x += regular.widthOfTextAtSize(sep, TL);
      const qualite = qualiteFr;
      const xq = XD - 4 - bold.widthOfTextAtSize(qualite, TL);
      page.drawText(qualite, { x: xq, y, size: TL, font: bold, color: NOIR });
      this.valeurSurPointilles(page, nom, x, xq - x - 6, y, bold);
      y -= 9.5;
      page.drawText("d'état civil", { x: M + 4, y, size: TL, font: bold, color: NOIR });
      page.drawText(` - ${qualiteEn}`, { x: M + 4 + bold.widthOfTextAtSize("d'état civil", TL), y, size: TL, font: regular, color: NOIR });
      y -= INTERLIGNE;
    };
    signataire('Par Nous,', 'By Us,', d.officier, 'Officier', 'Civil Status Registrar');
    if (d.secretaire) {
      signataire('Assisté de', 'In the presence of', d.secretaire, 'Secrétaire', 'Secretary');
    }

    // "Le - On the" (date de delivrance), centre comme sur le formulaire
    const xLe = M + W / 3;
    page.drawText('Le', { x: xLe, y, size: TL, font: bold, color: NOIR });
    page.drawText(' - On the ', { x: xLe + bold.widthOfTextAtSize('Le', TL), y, size: TL, font: regular, color: NOIR });
    const xvLe = xLe + bold.widthOfTextAtSize('Le', TL) + regular.widthOfTextAtSize(' - On the ', TL);
    this.valeurSurPointilles(page, format(d.dateDressage, 'dd MMMM yyyy', { locale: fr }), xvLe, XD - 4 - xvLe, y, regular);
    y -= INTERLIGNE;

    // ---------- Mention marginale ----------
    if (d.mentionMarginale) {
      y -= 2;
      page.drawText('Mention marginale / Marginal note :', { x: M + 4, y, size: 7.5, font: bold, color: VERT });
      y -= 10;
      for (const l of this.decouper(d.mentionMarginale, regular, 7.5, W - 8)) {
        page.drawText(l, { x: M + 4, y, size: 7.5, font: regular, color: NOIR });
        y -= 9.5;
      }
    }

    // ---------- Signatures ----------
    // Le pied (QR, code-barres) occupe une bande fixe ; les signatures se
    // placent sous le corps sans jamais y descendre.
    const ySign = Math.max(y - 14, M + 132);
    page.drawText("Le Secrétaire d'état civil", { x: M + 4, y: ySign, size: TL, font: bold, color: NOIR });
    page.drawText('Secretary', { x: M + 18, y: ySign - 9, size: TS, font: italic, color: GRIS });
    const sigOff = "Signature de l'Officier d'état civil";
    const sigOffEn = 'Signature of Civil Status Registrar';
    page.drawText(sigOff, { x: XD - 4 - bold.widthOfTextAtSize(sigOff, TL), y: ySign, size: TL, font: bold, color: NOIR });
    page.drawText(sigOffEn, { x: XD - 4 - italic.widthOfTextAtSize(sigOffEn, TS), y: ySign - 9, size: TS, font: italic, color: GRIS });

    // ---------- Authentification ----------
    const urlVerif = `${this.publicUrl}/verifier/${encodeURIComponent(d.qrToken)}`;
    const qrImg = await pdf.embedPng(await this.imagePng({ bcid: 'qrcode', text: urlVerif, scale: 3 }));
    const barreImg = await pdf.embedPng(
      await this.imagePng({ bcid: 'code128', text: d.numeroDeclaration, scale: 2, height: 7, includetext: true, textsize: 7 }),
    );

    const qrTaille = 58;
    page.drawImage(qrImg, { x: M + W / 2 - qrTaille / 2, y: M + 46, width: qrTaille, height: qrTaille });
    const bw = Math.min(barreImg.width * 0.7, 200);
    page.drawImage(barreImg, { x: M + W / 2 - bw / 2, y: M + 18, width: bw, height: (barreImg.height / barreImg.width) * bw });
    this.centre(page, `Authenticité vérifiable sur ${this.publicUrl}/verifier`, M, W, M + 6, italic, 6.3, GRIS);

    return Buffer.from(await pdf.save());
  }

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  /**
   * Valeur posee sur une ligne pointillee. Une valeur trop longue est d'abord
   * reduite en corps (jusqu'a 6.8 pt) avant d'etre tronquee : aucune mention
   * portee a l'acte ne doit disparaitre silencieusement.
   */
  private valeurSurPointilles(page: PDFPage, valeur: string, x: number, largeur: number, y: number, font: PDFFont, taille = TV) {
    page.drawLine({
      start: { x, y: y - 2.5 },
      end: { x: x + largeur, y: y - 2.5 },
      thickness: 0.5,
      color: GRIS,
      dashArray: [0.8, 1.8],
    });
    if (!valeur) return;
    const dispo = largeur - 4;
    let corps = taille;
    while (corps > 6.8 && font.widthOfTextAtSize(valeur, corps) > dispo) corps -= 0.2;
    let texte = valeur;
    if (font.widthOfTextAtSize(texte, corps) > dispo) {
      while (texte.length > 3 && font.widthOfTextAtSize(`${texte}...`, corps) > dispo) texte = texte.slice(0, -1);
      texte = `${texte}...`;
    }
    page.drawText(texte, { x: x + 2, y, size: corps, font, color: NOIR });
  }

  private centre(page: PDFPage, texte: string, x: number, largeur: number, y: number, font: PDFFont, taille: number, couleur = NOIR) {
    page.drawText(texte, { x: x + (largeur - font.widthOfTextAtSize(texte, taille)) / 2, y, size: taille, font, color: couleur });
  }

  /**
   * Repartit un texte sur une premiere ligne courte (reste de la ligne du
   * libelle) puis sur des lignes pleine largeur.
   */
  private repartir(texte: string, font: PDFFont, taille: number, premiereLargeur: number, largeurSuivantes: number): string[] {
    const lignes: string[] = [];
    let courante = '';
    let largeur = premiereLargeur;
    for (const mot of texte.split(' ')) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (courante && font.widthOfTextAtSize(essai, taille) > largeur) {
        lignes.push(courante);
        courante = mot;
        largeur = largeurSuivantes;
      } else courante = essai;
    }
    if (courante) lignes.push(courante);
    return lignes;
  }

  private decouper(texte: string, font: PDFFont, taille: number, largeur: number): string[] {
    const lignes: string[] = [];
    let courante = '';
    for (const mot of texte.split(' ')) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (font.widthOfTextAtSize(essai, taille) > largeur) {
        lignes.push(courante);
        courante = mot;
      } else courante = essai;
    }
    if (courante) lignes.push(courante);
    return lignes;
  }

  private async imagePng(opts: bwipjs.RenderOptions): Promise<Buffer> {
    return bwipjs.toBuffer({ ...opts, backgroundcolor: 'FFFFFF' });
  }

  // ------------------------------------------------------------------
  // Dates en toutes lettres (exigence du formulaire officiel)
  // ------------------------------------------------------------------

  /** "17 fevrier 1990" -> "dix-sept février mille neuf cent quatre-vingt-dix". */
  private dateEnLettres(date: Date): string {
    const jour = date.getDate();
    const mois = format(date, 'MMMM', { locale: fr });
    return `${jour === 1 ? 'premier' : PdfActeService.enLettres(jour)} ${mois} ${PdfActeService.enLettres(date.getFullYear())}`;
  }

  private static readonly UNITES = [
    'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
  ];
  private static readonly DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  /** Entier 0-9999 en toutes lettres (orthographe francaise traditionnelle). */
  static enLettres(n: number): string {
    const mille = Math.floor(n / 1000);
    const reste = n % 1000;
    if (mille === 0) return PdfActeService.sousMille(n);
    const tete = mille === 1 ? 'mille' : `${PdfActeService.sousMille(mille)} mille`;
    return reste === 0 ? tete : `${tete} ${PdfActeService.sousMille(reste)}`;
  }

  private static sousMille(n: number): string {
    const cent = Math.floor(n / 100);
    const reste = n % 100;
    if (cent === 0) return PdfActeService.sousCent(n);
    const tete = cent === 1 ? 'cent' : `${PdfActeService.UNITES[cent]} cent${reste === 0 ? 's' : ''}`;
    return reste === 0 ? tete : `${tete} ${PdfActeService.sousCent(reste)}`;
  }

  private static sousCent(n: number): string {
    if (n < 20) return PdfActeService.UNITES[n];
    const d = Math.floor(n / 10);
    const u = n % 10;
    // 70-79 et 90-99 : soixante-dix... / quatre-vingt-dix...
    if (d === 7 || d === 9) {
      if (d === 7 && u === 1) return 'soixante et onze';
      return `${PdfActeService.DIZAINES[d]}-${PdfActeService.UNITES[10 + u]}`;
    }
    if (u === 0) return d === 8 ? 'quatre-vingts' : PdfActeService.DIZAINES[d];
    if (u === 1 && d !== 8) return `${PdfActeService.DIZAINES[d]} et un`;
    return `${PdfActeService.DIZAINES[d]}-${PdfActeService.UNITES[u]}`;
  }
}
