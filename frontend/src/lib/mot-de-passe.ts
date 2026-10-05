/**
 * Politique des mots de passe (miroir de backend/src/common/mot-de-passe.ts ;
 * le serveur reste l'autorite) : 8 caracteres au moins, dont une majuscule,
 * un chiffre et un caractere special.
 */
export const LONGUEUR_MIN_MOT_DE_PASSE = 8;

export const AIDE_MOT_DE_PASSE = '8 caractères minimum, dont une majuscule, un chiffre et un caractère spécial (ex. ! ? # @).';

/** Exigences non satisfaites, vides si le mot de passe est conforme. */
export function defautsMotDePasse(mdp: string): string[] {
  const defauts: string[] = [];
  if (mdp.length < LONGUEUR_MIN_MOT_DE_PASSE) defauts.push(`${LONGUEUR_MIN_MOT_DE_PASSE} caractères minimum`);
  if (mdp.length > 128) defauts.push('128 caractères maximum');
  if (!/\p{Lu}/u.test(mdp)) defauts.push('une majuscule');
  if (!/[0-9]/.test(mdp)) defauts.push('un chiffre');
  if (!/[^\p{L}\p{N}]/u.test(mdp)) defauts.push('un caractère spécial');
  return defauts;
}

/** Message d'erreur pret a afficher, ou null si le mot de passe est conforme. */
export function erreurMotDePasse(mdp: string): string | null {
  const d = defautsMotDePasse(mdp);
  return d.length ? `Mot de passe non conforme — il manque : ${d.join(', ')}.` : null;
}
