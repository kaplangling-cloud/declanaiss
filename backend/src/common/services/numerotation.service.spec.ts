import { NumerotationService } from './numerotation.service';

/**
 * La cle de controle protege la saisie manuelle du numero sur la page
 * publique de verification : elle doit rejeter les fautes de frappe et les
 * transpositions de chiffres.
 */
describe('NumerotationService - cle de controle', () => {
  const base = 'R09-HREBO-2026-000123';
  const numero = `${base}-${NumerotationService.calculerCle(base)}`;

  it('accepte un numero correctement forme', () => {
    expect(NumerotationService.verifierFormat(numero)).toBe(true);
  });

  it('est insensible a la casse et aux espaces de bord', () => {
    expect(NumerotationService.verifierFormat(`  ${numero.toLowerCase()}  `)).toBe(true);
  });

  it('rejete une faute de frappe sur un chiffre', () => {
    expect(NumerotationService.verifierFormat(numero.replace('000123', '000124'))).toBe(false);
  });

  it('rejete une transposition de chiffres', () => {
    expect(NumerotationService.verifierFormat(numero.replace('000123', '000132'))).toBe(false);
  });

  it('rejete une cle alteree', () => {
    const faux = numero.slice(0, -2) + (numero.endsWith('ZZ') ? 'AA' : 'ZZ');
    expect(NumerotationService.verifierFormat(faux)).toBe(false);
  });

  it('rejete un format non conforme', () => {
    for (const mauvais of ['', 'abc', 'R09-2026-000123', 'R09-HREBO-26-000123-AA', 'R09-HREBO-2026-123-AA']) {
      expect(NumerotationService.verifierFormat(mauvais)).toBe(false);
    }
  });

  it("n'emploie pas les caracteres ambigus I et O dans la cle", () => {
    for (let i = 1; i <= 300; i++) {
      const cle = NumerotationService.calculerCle(`R09-HREBO-2026-${String(i).padStart(6, '0')}`);
      expect(cle).toHaveLength(2);
      expect(cle).not.toMatch(/[IO]/);
    }
  });
});
