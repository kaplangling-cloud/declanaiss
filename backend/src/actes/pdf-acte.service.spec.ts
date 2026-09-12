import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { DonneesActe, PdfActeService } from './pdf-acte.service';

const service = new PdfActeService({ get: () => 'https://exemple.cm' } as unknown as ConfigService);

describe('PdfActeService.enLettres', () => {
  it('ecrit les unites et les dizaines irregulieres', () => {
    const attendu: Array<[number, string]> = [
      [1, 'un'], [8, 'huit'], [11, 'onze'], [16, 'seize'], [17, 'dix-sept'],
      [20, 'vingt'], [21, 'vingt et un'], [30, 'trente'], [31, 'trente et un'],
      [70, 'soixante-dix'], [71, 'soixante et onze'], [75, 'soixante-quinze'],
      [80, 'quatre-vingts'], [81, 'quatre-vingt-un'], [90, 'quatre-vingt-dix'], [95, 'quatre-vingt-quinze'],
    ];
    for (const [n, mot] of attendu) expect(PdfActeService.enLettres(n)).toBe(mot);
  });

  it('ecrit les annees portees sur un acte', () => {
    expect(PdfActeService.enLettres(1971)).toBe('mille neuf cent soixante et onze');
    expect(PdfActeService.enLettres(1990)).toBe('mille neuf cent quatre-vingt-dix');
    expect(PdfActeService.enLettres(1995)).toBe('mille neuf cent quatre-vingt-quinze');
    expect(PdfActeService.enLettres(2000)).toBe('deux mille');
    expect(PdfActeService.enLettres(2001)).toBe('deux mille un');
    expect(PdfActeService.enLettres(2020)).toBe('deux mille vingt');
    expect(PdfActeService.enLettres(2026)).toBe('deux mille vingt-six');
  });

  it('accorde "cent" au pluriel seulement sans reste', () => {
    expect(PdfActeService.enLettres(200)).toBe('deux cents');
    expect(PdfActeService.enLettres(201)).toBe('deux cent un');
    expect(PdfActeService.enLettres(100)).toBe('cent');
  });
});

describe('PdfActeService.generer', () => {
  const parent = {
    nom: 'Essomba', prenoms: 'Paul', dateNaissance: new Date('1988-04-12'), lieuNaissance: 'Sangmelima',
    domicile: 'Ebolowa', profession: 'Enseignant', nationalite: 'Camerounaise',
    cniNumero: '100200300', cniDateDelivrance: new Date('2012-05-20'),
  };

  const donnees = (extra: Partial<DonneesActe> = {}): DonneesActe => ({
    numeroActe: 'EBO1/2026/00012', numeroDeclaration: 'R09-HREBO-2026-000123-60',
    qrToken: 'jeton-de-test-opaque', dateDressage: new Date('2026-09-12'), mentionMarginale: null,
    region: { fr: 'SUD', en: 'SOUTH' }, departement: { fr: 'Mvila', en: 'Mvila' },
    arrondissement: { fr: 'Ebolowa 1er', en: 'Ebolowa 1er' },
    mairie: "Centre d'etat civil principal de la Mairie d'Ebolowa 1er",
    enfantNom: 'Essomba', enfantPrenoms: 'Grace Divine', enfantSexe: 'FEMININ',
    enfantDateNaissance: new Date('2026-09-10'), enfantHeureNaissance: '06:20',
    lieuNaissance: "Hopital Regional d'Ebolowa, Ebolowa 1er",
    pere: parent, mere: { ...parent, nom: 'Ngo Bassong', prenoms: 'Claire' },
    declarant: 'Rose NGO (Sage-femme)', officier: 'Aline NKOLO', secretaire: 'Marc ESSOMBA',
    ...extra,
  });

  it('produit un PDF exploitable', async () => {
    const pdf = await service.generer(donnees());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(10_000);
  });

  it("tient sur une page malgre des valeurs longues, l'absence de secretaire et une mention marginale", async () => {
    const pdf = await service.generer(
      donnees({
        secretaire: null,
        mentionMarginale:
          "Rectification de la date de naissance suivant jugement n° 0451/CIV du Tribunal de Premiere Instance d'Ebolowa du 4 juillet 2027, transcrite le 12 juillet 2027.",
        declarant: "Jean-Baptiste Emmanuel BAKOUMBENG-TCHOUMKEU, pere de l'enfant, domicilie a Mokolo, quartier Ouro-Tada",
        enfantPrenoms: 'Marie-Josephine Adele Ngonde Bakoumbeng-Tchoumkeu',
      }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // Une seule page : le corps est borne pour ne pas empieter sur le pied
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it('accepte un jour de naissance au premier du mois', async () => {
    const pdf = await service.generer(donnees({ enfantDateNaissance: new Date('2026-11-01') }));
    expect(pdf.length).toBeGreaterThan(10_000);
  });
});
