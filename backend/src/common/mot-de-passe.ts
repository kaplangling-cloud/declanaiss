import { randomInt } from 'crypto';

/**
 * Politique des mots de passe : 8 caracteres au moins, dont une majuscule, un
 * chiffre et un caractere special. Elle s'applique a chaque mot de passe choisi
 * ou attribue (creation, reinitialisation, changement) ; un mot de passe deja
 * enregistre sous une ancienne regle reste valable jusqu'a son prochain changement.
 * Miroir cote interface : frontend/src/lib/mot-de-passe.ts.
 */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;
/** Borne haute : argon2 hacherait sinon des chaines arbitrairement longues. */
export const LONGUEUR_MAX_MOT_DE_PASSE = 128;

export const MESSAGE_MOT_DE_PASSE =
  'Mot de passe : 8 caracteres minimum, dont une majuscule, un chiffre et un caractere special';

/** Raisons de refus, vides si le mot de passe respecte la politique. */
export function defautsMotDePasse(mdp: string): string[] {
  const defauts: string[] = [];
  if (mdp.length < LONGUEUR_MIN_MOT_DE_PASSE) defauts.push(`au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caracteres`);
  if (mdp.length > LONGUEUR_MAX_MOT_DE_PASSE) defauts.push(`au plus ${LONGUEUR_MAX_MOT_DE_PASSE} caracteres`);
  // Toute majuscule, accentuee comprise (É, À...) : un clavier francais les saisit naturellement
  if (!/\p{Lu}/u.test(mdp)) defauts.push('une majuscule');
  if (!/[0-9]/.test(mdp)) defauts.push('un chiffre');
  // Special : tout ce qui n'est ni lettre ni chiffre (lettres accentuees comprises comme lettres)
  if (!/[^\p{L}\p{N}]/u.test(mdp)) defauts.push('un caractere special');
  return defauts;
}

export const estMotDePasseConforme = (mdp: string) => defautsMotDePasse(mdp).length === 0;

const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O, ambigus a la lecture
const MINUSCULES = 'abcdefghijkmnpqrstuvwxyz';
const CHIFFRES = '23456789';
const SPECIAUX = '!#$%&*+-=?@';

/** Mot de passe provisoire aleatoire conforme (16 caracteres), pour les scripts. */
export function motDePasseAleatoire(longueur = 16): string {
  const tous = MAJUSCULES + MINUSCULES + CHIFFRES + SPECIAUX;
  const tirer = (jeu: string) => jeu[randomInt(jeu.length)];
  const car = [tirer(MAJUSCULES), tirer(MINUSCULES), tirer(CHIFFRES), tirer(SPECIAUX)];
  while (car.length < longueur) car.push(tirer(tous));
  // Melange de Fisher-Yates, pour que les classes imposees ne soient pas en tete
  for (let i = car.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [car[i], car[j]] = [car[j], car[i]];
  }
  return car.join('');
}
