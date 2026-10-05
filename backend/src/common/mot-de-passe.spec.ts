import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangerMotDePasseDto } from '../auth/dto/auth.dto';
import { defautsMotDePasse, estMotDePasseConforme, motDePasseAleatoire } from './mot-de-passe';

describe('Politique des mots de passe', () => {
  it('accepte 8 caracteres avec majuscule, chiffre et caractere special', () => {
    for (const mdp of ['Ebolowa1!', 'ABCDEF1#', 'Sécurité9?', 'Mot de 1 passe']) expect(estMotDePasseConforme(mdp)).toBe(true);
  });

  it('signale chaque exigence manquante', () => {
    expect(defautsMotDePasse('Abc1!')).toEqual(['au moins 8 caracteres']);
    expect(defautsMotDePasse('ebolowa1!')).toEqual(['une majuscule']);
    expect(defautsMotDePasse('Ebolowa!!')).toEqual(['un chiffre']);
    expect(defautsMotDePasse('Ebolowa12')).toEqual(['un caractere special']);
  });

  it('ne compte pas une lettre accentuee comme caractere special', () => {
    expect(defautsMotDePasse('Élevéeé1')).toEqual(['un caractere special']);
    expect(estMotDePasseConforme('Élevé1!x')).toBe(true); // É compte comme majuscule
  });

  it('refuse un mot de passe demesure', () => {
    expect(defautsMotDePasse(`A1!${'x'.repeat(200)}`)).toEqual(['au plus 128 caracteres']);
  });

  it('genere des mots de passe provisoires toujours conformes', () => {
    for (let i = 0; i < 500; i++) {
      const mdp = motDePasseAleatoire();
      expect(mdp).toHaveLength(16);
      expect(estMotDePasseConforme(mdp)).toBe(true);
    }
  });
});

describe('Validation des requetes (DTO)', () => {
  // Verifie le decorateur tel que l'API l'applique (ValidationPipe)
  const erreurs = async (nouveau: string) =>
    validate(plainToInstance(ChangerMotDePasseDto, { ancienMotDePasse: 'x', nouveauMotDePasse: nouveau }));

  it('accepte un mot de passe conforme', async () => {
    expect(await erreurs('Ebolowa1!')).toHaveLength(0);
  });

  it('refuse un mot de passe non conforme en nommant ce qui manque', async () => {
    const [e] = await erreurs('ebolowa1');
    expect(Object.values(e.constraints ?? {})[0]).toMatch(/manque : une majuscule, un caractere special/);
  });
});
