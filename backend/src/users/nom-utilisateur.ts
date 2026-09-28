/**
 * Nom d'utilisateur : identifiant de connexion alternatif a l'adresse e-mail.
 *
 * Stocke en minuscules, 3 a 30 caracteres parmi lettres non accentuees, chiffres,
 * point, tiret et tiret bas, commencant par une lettre ou un chiffre. Il ne contient
 * jamais "@" : c'est ce qui permet a la connexion de distinguer un nom d'utilisateur
 * d'une adresse e-mail saisis dans le meme champ.
 */
export const FORMAT_NOM_UTILISATEUR = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export const MESSAGE_FORMAT_NOM_UTILISATEUR =
  "Nom d'utilisateur : 3 a 30 caracteres (lettres sans accent, chiffres, . _ -), commencant par une lettre ou un chiffre";

/** Forme canonique (espaces de bord retires, minuscules) ; laisse passer les autres types. */
export function normaliserNomUtilisateur(valeur: unknown): unknown {
  return typeof valeur === 'string' ? valeur.trim().toLowerCase() : valeur;
}

/** Une saisie de connexion est une adresse e-mail des qu'elle contient "@". */
export const estAdresseEmail = (identifiant: string) => identifiant.includes('@');
