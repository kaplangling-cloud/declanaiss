import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import * as bwipjs from 'bwip-js';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ModeAccouchement, Sexe, StatutDeclaration, TermeGrossesse } from '@prisma/client';
import { PdfActeService, Circonscription } from '../actes/pdf-acte.service';

/** Logo de l'application (src/assets en dev, dist/assets une fois compile). */
const CHEMIN_LOGO = path.join(__dirname, '..', 'assets', 'logo.png');

export interface DonneesDeclaration {
  numeroDeclaration: string;
  qrToken: string;
  statut: StatutDeclaration;
  dateSoumission: Date | null;
  dateLimiteModification: Date | null;
  /** Numero de l'acte, lorsque la mairie l'a deja dresse. */
  numeroActe?: string | null;

  /** Rattachement administratif du CENTRE DE SANTE qui declare (FR / EN). */
  region: Circonscription;
  departement: Circonscription;
  arrondissement: Circonscription;
  centre: { nom: string; numeroAutorisation: string; adresse: string | null; chefNom: string; chefFonction: string };
  /** Mairie destinataire de la declaration. */
  mairie: string;

  enfantNom: string;
  enfantPrenoms: string;
  enfantSexe: Sexe | null;
  enfantDateNaissance: Date | null;
  enfantHeureNaissance: string | null;

  modeAccouchement: ModeAccouchement | null;
  termeGrossesse: TermeGrossesse | null;
  moisGrossesse: number | null;
  poidsNaissanceGrammes: number | null;

  pere: ParentDeclare;
  mere: ParentDeclare;

  accoucheur: { nom: string; fonction: string; numeroOrdre: string | null } | null;
  declarant: string;
  declarantContact: string | null;
  editeLe: Date;
}

export interface ParentDeclare {
  nom: string | null;
  prenoms: string | null;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  domicile: string | null;
  profession: string | null;
  nationalite: string | null;
  /** Deja masque (SECRETAIRE_MAIRIE) ou en clair, selon le role du demandeur. */
  cniNumero: string | null;
  cniDateDelivrance: Date | null;
}

const VERT = rgb(0.05, 0.42, 0.24);
const NOIR = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);
const ROUGE = rgb(0.65, 0.11, 0.11);

// Mise en page (points PDF, A4 595.28 x 841.89)
const M = 36;
const TL = 8.2; // libelles
const TV = 9.2; // valeurs
const TS = 6.3; // sous-libelles anglais
const INTERLIGNE = 12.2;
/** Bande de pied reservee (signatures, QR, code-barres) : le corps ne descend jamais dedans. */
const PIED = 128;

const LIB_SEXE: Record<Sexe, string> = { MASCULIN: 'Masculin / Male', FEMININ: 'Féminin / Female' };
const LIB_MODE: Record<ModeAccouchement, string> = {
  VOIE_BASSE: 'Voie basse / Vaginal delivery',
  CESARIENNE: 'Césarienne / Caesarean section',
};

/**
 * Declaration de naissance etablie par le centre de sante, remise aux parents
 * et destinee a l'officier d'etat civil : c'est la piece que la famille presente
 * au guichet, pendant que la declaration circule par voie dematerialisee.
 *
 * Elle n'est pas un acte de naissance et ne le remplace pas : le document le
 * rappelle explicitement, et une declaration renvoyee pour correction porte un
 * bandeau qui interdit de la prendre pour definitive.
 *
 * Le document est genere a la demande (aucune copie stockee) : il reflete donc
 * toujours l'etat courant du dossier. L'en-tete porte le rattachement
 * administratif du CENTRE DE SANTE, a la difference de l'acte, qui porte celui
 * de la mairie.
 */
@Injectable()
export class PdfDeclarationService {
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.publicUrl = config.get<string>('publicUrl') || '';
  }

  async generer(d: DonneesDeclaration): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Declaration de naissance ${d.numeroDeclaration}`);
    pdf.setProducer('Declaration de naissance en ligne');
    pdf.setCreationDate(new Date());

    const page = pdf.addPage([595.28, 841.89]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    const H = page.getHeight();
    const W = page.getWidth() - 2 * M;
    const XD = M + W;
    let y = H - M;

    // ---------- Cadre ----------
    page.drawRectangle({ x: M - 8, y: M - 8, width: W + 16, height: H - 2 * M + 16, borderColor: VERT, borderWidth: 1.2 });
    page.drawRectangle({ x: M - 8, y: H - M + 4, width: W + 16, height: 4, color: VERT });

    // ---------- Logo et horodatage d'edition ----------
    try {
      const logo = await pdf.embedPng(await fs.readFile(CHEMIN_LOGO));
      page.drawImage(logo, { x: M, y: H - M - 44, width: 42, height: 42 });
    } catch {
      /* logo absent : le document reste lisible sans */
    }
    const edite = `Édité le ${format(d.editeLe, 'dd/MM/yyyy à HH:mm', { locale: fr })}`;
    page.drawText(edite, { x: XD - regular.widthOfTextAtSize(edite, 6.5), y: H - M - 8, size: 6.5, font: regular, color: GRIS });

    // ---------- En-tete republicain (deux colonnes FR / EN) ----------
    y -= 20;
    const xCol = M + 56;
    const demi = (W - 56) / 2;
    this.centre(page, 'REPUBLIQUE DU CAMEROUN', xCol, demi, y, bold, 10, VERT);
    this.centre(page, 'REPUBLIC OF CAMEROON', xCol + demi, demi, y, bold, 10, VERT);
    y -= 10;
    this.centre(page, 'Paix - Travail - Patrie', xCol, demi, y, italic, 7, GRIS);
    this.centre(page, 'Peace - Work - Fatherland', xCol + demi, demi, y, italic, 7, GRIS);
    y -= 11;
    this.centre(page, 'MINISTERE DE LA SANTE PUBLIQUE', xCol, demi, y, bold, 7.2, NOIR);
    this.centre(page, 'MINISTRY OF PUBLIC HEALTH', xCol + demi, demi, y, bold, 7.2, NOIR);

    // ---------- Rattachement administratif du centre de sante ----------
    y -= 20;
    const rubriques: Array<[string, string, Circonscription]> = [
      ['REGION', 'REGION', d.region],
      ['DEPARTEMENT', 'DIVISION', d.departement],
      ['ARRONDISSEMENT', 'SUBDIVISION', d.arrondissement],
    ];
    for (const [labFr, labEn, valeur] of rubriques) {
      page.drawText(labFr, { x: xCol, y, size: 7.5, font: bold, color: NOIR });
      page.drawText(labEn, { x: xCol + demi, y, size: 7.5, font: bold, color: NOIR });
      this.valeurSurPointilles(page, valeur.fr, xCol, demi - 14, y - 10, regular);
      this.valeurSurPointilles(page, valeur.en || valeur.fr, xCol + demi, demi - 14, y - 10, regular);
      y -= 19;
    }

    // ---------- Formation sanitaire ----------
    y -= 3;
    this.centre(page, 'FORMATION SANITAIRE / HEALTH FACILITY', M, W, y, bold, 8.5, NOIR);
    y -= 13;
    const de = 'de';
    const sepDe = ' - of ';
    const largeurDe = bold.widthOfTextAtSize(de, TL) + regular.widthOfTextAtSize(sepDe, TL);
    page.drawText(de, { x: M + 4, y, size: TL, font: bold, color: NOIR });
    page.drawText(sepDe, { x: M + 4 + bold.widthOfTextAtSize(de, TL), y, size: TL, font: regular, color: NOIR });
    this.valeurSurPointilles(page, d.centre.nom, M + 4 + largeurDe, W - largeurDe - 8, y, bold);
    y -= 12;
    const autorisation = `Autorisation n° ${d.centre.numeroAutorisation}${d.centre.adresse ? ` — ${d.centre.adresse}` : ''}`;
    page.drawText(autorisation, { x: M + 4, y, size: 6.8, font: regular, color: GRIS });

    // ---------- Titre ----------
    y -= 22;
    const t1 = 'DÉCLARATION DE NAISSANCE';
    const t2 = ' / BIRTH DECLARATION';
    const largeurTitre = bold.widthOfTextAtSize(t1, 15) + regular.widthOfTextAtSize(t2, 15);
    const xTitre = M + (W - largeurTitre) / 2;
    page.drawText(t1, { x: xTitre, y, size: 15, font: bold, color: VERT });
    page.drawText(t2, { x: xTitre + bold.widthOfTextAtSize(t1, 15), y, size: 15, font: regular, color: NOIR });
    y -= 13;
    this.centre(page, `N° : ${d.numeroDeclaration}`, M, W, y, bold, 11, NOIR);
    y -= 10;
    this.centre(page, `À l'attention de l'Officier d'état civil — ${d.mairie}`, M, W, y, italic, 7.5, GRIS);
    y -= 12;

    // ---------- Bandeau d'etat, pour les dossiers non definitifs ----------
    const bandeau = this.bandeau(d.statut);
    if (bandeau) {
      page.drawRectangle({ x: M - 2, y: y - 12, width: W + 4, height: 16, color: rgb(0.99, 0.93, 0.93), borderColor: ROUGE, borderWidth: 0.6 });
      this.centre(page, bandeau, M, W, y - 8, bold, 8, ROUGE);
      y -= 20;
    }

    // ---------- Corps ----------
    /** Rubrique "Libelle FR - Label EN  <valeur sur pointilles>". */
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

    /**
     * Rubrique dont la valeur se poursuit a la ligne suivante plutot que d'etre
     * tronquee : l'identite du declarant ne doit pas disparaitre du document.
     */
    const rubriqueLongue = (labFr: string, labEn: string, valeur: string) => {
      let x = M + 4;
      page.drawText(labFr, { x, y, size: TL, font: bold, color: NOIR });
      x += bold.widthOfTextAtSize(labFr, TL);
      const sep = ` - ${labEn} `;
      page.drawText(sep, { x, y, size: TL, font: regular, color: NOIR });
      x += regular.widthOfTextAtSize(sep, TL);
      const lignes = this.repartir(valeur, bold, TV, XD - 8 - x, W - 12);
      this.valeurSurPointilles(page, lignes[0] ?? '', x, XD - 4 - x, y, bold);
      y -= INTERLIGNE;
      for (const suite of lignes.slice(1)) {
        this.valeurSurPointilles(page, suite, M + 4, W - 8, y, bold);
        y -= INTERLIGNE;
      }
    };

    /** Intitule de section, sur fond vert pale. */
    const section = (titreFr: string, titreEn: string) => {
      y -= 2;
      page.drawRectangle({ x: M - 2, y: y - 3, width: W + 4, height: 11.5, color: rgb(0.93, 0.97, 0.94) });
      page.drawText(titreFr, { x: M + 4, y, size: 8, font: bold, color: VERT });
      page.drawText(` / ${titreEn}`, { x: M + 4 + bold.widthOfTextAtSize(titreFr, 8), y, size: 7, font: italic, color: GRIS });
      y -= INTERLIGNE;
    };

    const documentReference = (p: ParentDeclare) =>
      p.cniNumero ? `CNI N° ${p.cniNumero}${p.cniDateDelivrance ? ` du ${format(p.cniDateDelivrance, 'dd/MM/yyyy')}` : ''}` : '';

    // Enfant
    section("ENFANT DÉCLARÉ", 'CHILD');
    rubrique('Nom', 'Surname', (d.enfantNom ?? '').toUpperCase(), { gras: true });
    rubrique('Prénoms', 'Given names', d.enfantPrenoms ?? '', { gras: true });
    rubrique('Né(e) le', 'Born on the', this.naissanceEnLettres(d.enfantDateNaissance, d.enfantHeureNaissance));
    rubrique('A', 'At', `${d.centre.nom}, ${d.arrondissement.fr}`);
    rubrique('De sexe', 'Sex', d.enfantSexe ? LIB_SEXE[d.enfantSexe] : '');

    // Constat de l'accouchement (donnees medicales : elles restent sur la
    // declaration et ne figurent jamais sur l'acte de naissance)
    section("CONSTAT DE L'ACCOUCHEMENT", 'DELIVERY REPORT');
    rubrique(
      "Mode d'accouchement et terme",
      'Mode of delivery and term',
      [d.modeAccouchement ? LIB_MODE[d.modeAccouchement] : '', this.terme(d.termeGrossesse, d.moisGrossesse)].filter(Boolean).join(' — '),
    );
    rubrique('Poids à la naissance', 'Weight at birth', d.poidsNaissanceGrammes ? `${d.poidsNaissanceGrammes} g` : '');
    rubrique(
      "Personnel ayant effectué l'accouchement",
      'Delivered by',
      d.accoucheur ? `${d.accoucheur.nom} (${d.accoucheur.fonction}${d.accoucheur.numeroOrdre ? `, n° ${d.accoucheur.numeroOrdre}` : ''})` : '',
    );

    // Parents
    for (const [cle, titreFr, titreEn] of [['pere', 'PÈRE', 'FATHER'], ['mere', 'MÈRE', 'MOTHER']] as const) {
      const p = cle === 'pere' ? d.pere : d.mere;
      const accord = cle === 'pere' ? '' : 'e';
      section(titreFr, titreEn);
      rubrique('Nom et prénoms', 'Surname and given names', `${(p.nom ?? '').toUpperCase()} ${p.prenoms ?? ''}`.trim(), { gras: true });
      rubrique(
        `Né${accord} le`,
        'Born on the',
        [p.dateNaissance ? this.dateEnLettres(p.dateNaissance) : '', p.lieuNaissance ? `à ${p.lieuNaissance}` : ''].filter(Boolean).join(' '),
      );
      rubrique(`Domicilié${accord} à`, 'Resident at', p.domicile ?? '');
      rubrique('Profession', 'Occupation', p.profession ?? '');
      rubrique('Nationalité', 'Nationality', p.nationalite ?? '');
      rubrique('Document de référence', 'Reference document', documentReference(p));
    }

    // Declarant
    section('DÉCLARANT', 'DECLARANT');
    rubriqueLongue('Nom, prénoms et qualité', 'Name and capacity', d.declarant);
    rubrique('Contact', 'Contact', d.declarantContact ?? '');

    // ---------- Suivi du dossier ----------
    section('SUIVI DU DOSSIER', 'FILE STATUS');
    rubrique('Transmise à la mairie le', 'Sent to the council on the', d.dateSoumission ? format(d.dateSoumission, 'dd MMMM yyyy à HH:mm', { locale: fr }) : '');
    rubrique('État', 'Status', this.libelleStatut(d.statut));
    if (d.numeroActe) rubrique("Acte de naissance dressé sous le n°", 'Birth certificate No.', d.numeroActe, { gras: true });
    else if (d.statut === StatutDeclaration.SOUMISE && d.dateLimiteModification) {
      rubrique('Modifiable par le centre jusqu\'au', 'Amendable by the facility until', format(d.dateLimiteModification, 'dd MMMM yyyy', { locale: fr }));
    }

    // ---------- Avertissement ----------
    // Place juste au-dessus des signatures : le corps peut s'allonger sans le pousser
    // dans le pied de page.
    const avertissement = "Le présent document n'est pas un acte de naissance : il atteste que la naissance a été déclarée par la formation sanitaire à l'officier d'état civil. L'acte est délivré par la mairie.";
    const lignesAvert = this.decouper(avertissement, italic, 6.5, W - 8);
    const ySign = Math.max(y - 14 - lignesAvert.length * 8, M + PIED);
    let yAvert = ySign + 12 + lignesAvert.length * 8;
    for (const l of lignesAvert) {
      page.drawText(l, { x: M + 4, y: yAvert, size: 6.5, font: italic, color: GRIS });
      yAvert -= 8;
    }

    // ---------- Signatures ----------
    page.drawText('Le déclarant', { x: M + 4, y: ySign, size: TL, font: bold, color: NOIR });
    page.drawText('The declarant', { x: M + 4, y: ySign - 9, size: TS, font: italic, color: GRIS });
    const chef = `${d.centre.chefNom} — ${d.centre.chefFonction}`;
    const libChef = 'Le responsable de la formation sanitaire';
    page.drawText(libChef, { x: XD - 4 - bold.widthOfTextAtSize(libChef, TL), y: ySign, size: TL, font: bold, color: NOIR });
    page.drawText(chef, { x: XD - 4 - regular.widthOfTextAtSize(chef, TS + 0.5), y: ySign - 9, size: TS + 0.5, font: regular, color: NOIR });
    page.drawText('(signature et cachet)', { x: XD - 4 - italic.widthOfTextAtSize('(signature et cachet)', TS), y: ySign - 18, size: TS, font: italic, color: GRIS });

    // ---------- Authentification ----------
    const urlVerif = `${this.publicUrl}/verifier/${encodeURIComponent(d.qrToken)}`;
    const qrImg = await pdf.embedPng(await this.imagePng({ bcid: 'qrcode', text: urlVerif, scale: 3 }));
    const barreImg = await pdf.embedPng(
      await this.imagePng({ bcid: 'code128', text: d.numeroDeclaration, scale: 2, height: 7, includetext: true, textsize: 7 }),
    );
    const qrTaille = 52;
    page.drawImage(qrImg, { x: M + W / 2 - qrTaille / 2, y: M + 44, width: qrTaille, height: qrTaille });
    const bw = Math.min(barreImg.width * 0.7, 200);
    page.drawImage(barreImg, { x: M + W / 2 - bw / 2, y: M + 18, width: bw, height: (barreImg.height / barreImg.width) * bw });
    this.centre(page, `Authenticité vérifiable sur ${this.publicUrl}/verifier`, M, W, M + 6, italic, 6.3, GRIS);

    return Buffer.from(await pdf.save());
  }

  // ------------------------------------------------------------------
  // Libelles
  // ------------------------------------------------------------------

  /** Bandeau d'avertissement pour un dossier qui n'est pas en cours de traitement normal. */
  private bandeau(statut: StatutDeclaration): string | null {
    if (statut === StatutDeclaration.REJETEE) return 'RENVOYÉE POUR CORRECTION PAR LA MAIRIE — DOCUMENT NON DÉFINITIF';
    return null;
  }

  private libelleStatut(statut: StatutDeclaration): string {
    const libelles: Record<StatutDeclaration, string> = {
      BROUILLON: 'Brouillon / Draft',
      SOUMISE: "Transmise à l'officier d'état civil / Sent to the registrar",
      VALIDEE: 'Validée par la mairie / Validated by the council',
      REJETEE: 'Renvoyée pour correction / Returned for correction',
      VERROUILLEE: 'Verrouillée, en attente de validation / Locked, awaiting validation',
    };
    return libelles[statut];
  }

  private terme(terme: TermeGrossesse | null, mois: number | null): string {
    if (!terme) return '';
    if (terme === TermeGrossesse.PREMATURE) return `Prématuré / Premature${mois ? ` (${mois} mois)` : ''}`;
    return 'À terme / Full term';
  }

  /** "le dix-sept février mille neuf cent quatre-vingt-dix à 14:35". */
  private naissanceEnLettres(date: Date | null, heure: string | null): string {
    if (!date) return '';
    return `${this.dateEnLettres(date)}${heure ? ` à ${heure}` : ''}`;
  }

  private dateEnLettres(date: Date): string {
    const jour = date.getDate();
    const mois = format(date, 'MMMM', { locale: fr });
    return `${jour === 1 ? 'premier' : PdfActeService.enLettres(jour)} ${mois} ${PdfActeService.enLettres(date.getFullYear())}`;
  }

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  /** Valeur posee sur une ligne pointillee, reduite en corps avant d'etre tronquee. */
  private valeurSurPointilles(page: PDFPage, valeur: string, x: number, largeur: number, y: number, font: PDFFont, taille = TV) {
    page.drawLine({ start: { x, y: y - 2.5 }, end: { x: x + largeur, y: y - 2.5 }, thickness: 0.5, color: GRIS, dashArray: [0.8, 1.8] });
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

  /** Repartit un texte sur une premiere ligne courte (reste de la ligne du libelle) puis pleine largeur. */
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
}
