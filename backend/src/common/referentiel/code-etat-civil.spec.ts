import { codeCentreEtatCivil, nomCentreEtatCivil } from './code-etat-civil';

describe('codeCentreEtatCivil', () => {
  it('reproduit le code unique de RDC.xlsx', () => {
    expect(codeCentreEtatCivil('R01', 'D01', 'A001')).toBe('01001001'); // Ngaoundal
    expect(codeCentreEtatCivil('R09', 'D50', 'A309')).toBe('09050309'); // Ebolowa 1er
    expect(codeCentreEtatCivil('R10', 'D58', 'A360')).toBe('10058360'); // Toko
  });

  it('accepte des codes sans prefixe', () => {
    expect(codeCentreEtatCivil('01', '001', '001')).toBe('01001001');
  });

  it('refuse un code non conforme plutot que de produire un code ambigu', () => {
    expect(() => codeCentreEtatCivil('R100', 'D01', 'A001')).toThrow(/region/);
    expect(() => codeCentreEtatCivil('R01', 'DX', 'A001')).toThrow(/departement/);
    expect(() => codeCentreEtatCivil('R01', 'D01', 'A1000')).toThrow(/arrondissement/);
  });

  it('respecte le format des codes de mairie accepte ailleurs', () => {
    expect(codeCentreEtatCivil('R05', 'D26', 'A172')).toMatch(/^[A-Z0-9]{2,10}$/);
  });

  it("nomme le centre comme l'en-tete de RDC.xlsx", () => {
    expect(nomCentreEtatCivil('Ngaoundal')).toBe("Centre d'état civil de Ngaoundal");
  });
});
