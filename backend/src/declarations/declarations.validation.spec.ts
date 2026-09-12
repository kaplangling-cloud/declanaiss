import { BadRequestException } from '@nestjs/common';
import { validerPourSoumission } from './declarations.validation';

/** Charge utile complete et coherente, base des cas negatifs. */
const complete = () => ({
  enfantNom: 'Essomba',
  enfantPrenoms: 'Grace Divine',
  enfantSexe: 'FEMININ' as const,
  enfantDateNaissance: new Date('2026-09-10'),
  enfantHeureNaissance: '06:20',
  modeAccouchement: 'VOIE_BASSE' as const,
  termeGrossesse: 'A_TERME' as const,
  poidsNaissanceGrammes: 3250,
  pereNom: 'Essomba', perePrenoms: 'Paul', pereProfession: 'Enseignant', pereDomicile: 'Ebolowa',
  pereNationalite: 'Camerounaise', pereDateNaissance: new Date('1988-04-12'), pereLieuNaissance: 'Sangmelima',
  pereCniNumero: '100200300', pereCniDateDelivrance: new Date('2012-05-20'),
  mereNom: 'Ngo Bassong', merePrenoms: 'Claire', mereProfession: 'Commercante', mereDomicile: 'Ebolowa',
  mereNationalite: 'Camerounaise', mereDateNaissance: new Date('1992-08-03'), mereLieuNaissance: 'Douala',
  mereCniNumero: '400500600', mereCniDateDelivrance: new Date('2014-09-11'),
  personnelAccoucheurId: '11111111-1111-4111-8111-111111111111',
  declarantEstPersonnel: true,
});

/** Renvoie la liste des erreurs metier levees, ou [] si la validation passe. */
const erreurs = (d: Record<string, unknown>): string[] => {
  try {
    validerPourSoumission(d);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    const rep = (e as BadRequestException).getResponse() as { code: string; erreurs: string[] };
    expect(rep.code).toBe('VALIDATION_METIER');
    return rep.erreurs;
  }
};

describe('validerPourSoumission', () => {
  it('accepte une declaration complete', () => {
    expect(erreurs(complete())).toEqual([]);
  });

  it('exige chaque champ obligatoire', () => {
    for (const champ of ['enfantNom', 'enfantPrenoms', 'enfantSexe', 'enfantDateNaissance', 'enfantHeureNaissance',
      'modeAccouchement', 'termeGrossesse', 'poidsNaissanceGrammes', 'pereNom', 'mereNom', 'pereCniNumero',
      'mereCniDateDelivrance', 'personnelAccoucheurId']) {
      const d: Record<string, unknown> = complete();
      d[champ] = null;
      expect(erreurs(d).length).toBeGreaterThan(0);
    }
  });

  it('traite la chaine vide comme une absence', () => {
    expect(erreurs({ ...complete(), enfantNom: '' })).toContain("Nom de l'enfant est obligatoire");
  });

  it('refuse une naissance dans le futur', () => {
    const demain = new Date(Date.now() + 86_400_000);
    expect(erreurs({ ...complete(), enfantDateNaissance: demain }).join()).toMatch(/futur/);
  });

  it('exige les mois de grossesse pour un premature, et les refuse a 9 mois', () => {
    expect(erreurs({ ...complete(), termeGrossesse: 'PREMATURE' }).join()).toMatch(/mois de grossesse/);
    expect(erreurs({ ...complete(), termeGrossesse: 'PREMATURE', moisGrossesse: 7 })).toEqual([]);
    expect(erreurs({ ...complete(), termeGrossesse: 'PREMATURE', moisGrossesse: 9 }).join()).toMatch(/a terme/);
  });

  it("refuse un age de parent incoherent a la naissance de l'enfant", () => {
    expect(erreurs({ ...complete(), mereDateNaissance: new Date('2015-01-01') }).join()).toMatch(/Mere : age/);
    expect(erreurs({ ...complete(), pereDateNaissance: new Date('1900-01-01') }).join()).toMatch(/Pere : age/);
  });

  it('refuse une CNI delivree avant la naissance du parent ou dans le futur', () => {
    expect(erreurs({ ...complete(), pereCniDateDelivrance: new Date('1980-01-01') }).join()).toMatch(/avant la naissance/);
    const futur = new Date(Date.now() + 86_400_000);
    expect(erreurs({ ...complete(), mereCniDateDelivrance: futur }).join()).toMatch(/CNI dans le futur/);
  });

  it('exige l identite du declarant lorsqu il n est pas le personnel', () => {
    const liste = erreurs({ ...complete(), declarantEstPersonnel: false });
    expect(liste.join()).toMatch(/Declarant : nom/);
    expect(erreurs({
      ...complete(), declarantEstPersonnel: false,
      declarantNom: 'Essomba', declarantPrenoms: 'Paul', declarantQualite: "pere de l'enfant",
    })).toEqual([]);
  });

  it('accumule les erreurs au lieu de s arreter a la premiere', () => {
    expect(erreurs({}).length).toBeGreaterThan(15);
  });
});
