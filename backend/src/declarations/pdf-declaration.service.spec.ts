import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { DonneesDeclaration, ParentDeclare, PdfDeclarationService } from './pdf-declaration.service';

const service = new PdfDeclarationService({ get: () => 'https://exemple.cm' } as unknown as ConfigService);

describe('PdfDeclarationService.generer', () => {
  const parent: ParentDeclare = {
    nom: 'Essomba', prenoms: 'Paul', dateNaissance: new Date('1988-04-12'), lieuNaissance: 'Sangmelima',
    domicile: 'Ebolowa', profession: 'Enseignant', nationalite: 'Camerounaise',
    cniNumero: '100200300', cniDateDelivrance: new Date('2012-05-20'),
  };

  const donnees = (extra: Partial<DonneesDeclaration> = {}): DonneesDeclaration => ({
    numeroDeclaration: 'R09-HREBO-2026-000123-60', qrToken: 'jeton-de-test-opaque',
    statut: 'SOUMISE', dateSoumission: new Date('2026-09-11T08:30:00Z'),
    dateLimiteModification: new Date('2026-09-18T08:30:00Z'), numeroActe: null,
    region: { fr: 'SUD', en: 'SOUTH' }, departement: { fr: 'Mvila', en: 'Mvila' },
    arrondissement: { fr: 'Ebolowa 1er', en: 'Ebolowa 1er' },
    centre: {
      nom: "Hopital Regional d'Ebolowa", numeroAutorisation: 'AUT-SU-2020-0042', adresse: 'Quartier administratif, Ebolowa',
      chefNom: 'Dr MBALLA Jean', chefFonction: 'Directeur',
    },
    mairie: "Centre d'etat civil d'Ebolowa 1er",
    enfantNom: 'Essomba', enfantPrenoms: 'Grace Divine', enfantSexe: 'FEMININ',
    enfantDateNaissance: new Date('2026-09-10'), enfantHeureNaissance: '06:20',
    modeAccouchement: 'VOIE_BASSE', termeGrossesse: 'A_TERME', moisGrossesse: null, poidsNaissanceGrammes: 3250,
    pere: parent, mere: { ...parent, nom: 'Ngo Bassong', prenoms: 'Claire' },
    accoucheur: { nom: 'Rose NGO', fonction: 'Sage-femme', numeroOrdre: 'SF-4521' },
    declarant: 'Rose NGO (Sage-femme, Hopital Regional d\'Ebolowa)', declarantContact: '+237 6XX XX XX XX',
    editeLe: new Date('2026-09-12T10:00:00Z'),
    ...extra,
  });

  it('produit un PDF exploitable sur une page', async () => {
    const pdf = await service.generer(donnees());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10_000);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('tient sur une page dans le cas defavorable : valeurs longues, premature, acte dresse et bandeau', async () => {
    const pdf = await service.generer(
      donnees({
        statut: 'REJETEE',
        numeroActe: '09050309/2026/00017',
        termeGrossesse: 'PREMATURE', moisGrossesse: 7,
        enfantPrenoms: 'Marie-Josephine Adele Ngonde Bakoumbeng-Tchoumkeu',
        declarant: "Jean-Baptiste Emmanuel BAKOUMBENG-TCHOUMKEU, pere de l'enfant, domicilie a Mokolo, quartier Ouro-Tada",
        mere: { ...parent, nom: 'Ngo Bassong-Tchoumkeu', prenoms: 'Claire Emmanuelle Josephine', domicile: 'Ebolowa, quartier Nko\'ovos II, derriere le marche central' },
      }),
    );
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('accepte un dossier incomplet et des CNI masquees', async () => {
    const vide: ParentDeclare = {
      nom: 'Essomba', prenoms: null, dateNaissance: null, lieuNaissance: null, domicile: null,
      profession: null, nationalite: null, cniNumero: '••••', cniDateDelivrance: null,
    };
    const pdf = await service.generer(donnees({ pere: vide, mere: vide, accoucheur: null, declarantContact: null, poidsNaissanceGrammes: null }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('accepte une naissance au premier du mois', async () => {
    const pdf = await service.generer(donnees({ enfantDateNaissance: new Date('2026-11-01') }));
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
