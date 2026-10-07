import type { Statut } from '../../types';

/**
 * Couleurs des graphiques. Les jeux categoriels sont VALIDES (lisibilite,
 * daltonismes, contraste >= 3:1 sur fond blanc) avec le script du skill dataviz
 * (validate_palette.js) : ne pas les modifier sans le relancer.
 *
 * La couleur suit l'entite : un statut ou un mode d'accouchement garde la meme
 * couleur dans tous les graphiques de l'application.
 */

/**
 * Statuts, dans l'ordre des segments : soumise, validee, verrouillee, rejetee.
 * Cet ordre est le mecanisme de securite daltonisme : il evite que le vert
 * (validee) et le rouge (rejetee) se touchent. Le brouillon, absent des
 * statistiques, reste un gris neutre (toujours accompagne de son libelle).
 */
export const ORDRE_STATUTS: Statut[] = ['SOUMISE', 'VALIDEE', 'VERROUILLEE', 'REJETEE', 'BROUILLON'];
export const COULEUR_STATUT: Record<Statut, string> = {
  SOUMISE: '#2a78d6',
  VALIDEE: '#0f7a43',
  VERROUILLEE: '#c98500',
  REJETEE: '#d03b3b',
  BROUILLON: '#a3a29b',
};

/** Modes d'accouchement : bleu / orange (emplacements 1 et 2 de la palette de reference). */
export const COULEUR_MODE = { VOIE_BASSE: '#2a78d6', CESARIENNE: '#eb6834', NON_RENSEIGNE: '#a3a29b' } as const;

/** Serie unique (naissances par centre, barres de donnees). */
export const COULEUR_SERIE = '#2a78d6';

/** Habillage : quadrillage et axes discrets, encres de texte. */
export const ENCRE = {
  primaire: '#0b0b0b',
  secondaire: '#52514e',
  discrete: '#6b6a64',
  quadrillage: '#e1e0d9',
  axe: '#c3c2b7',
  surface: '#ffffff',
};
