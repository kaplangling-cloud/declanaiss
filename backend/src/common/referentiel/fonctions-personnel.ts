/**
 * Fonctions du personnel de sante habilite a declarer une naissance.
 * La valeur est reprise telle quelle sur la declaration imprimable et sur l'acte
 * (rubrique du declarant) : ce sont des libelles, d'ou les accents.
 * Liste reprise cote interface dans frontend/src/types.ts.
 */
export const FONCTIONS_PERSONNEL = ['Docteur', 'Sage-femme', 'Infirmier(ère) accoucheur(se)'] as const;

export type FonctionPersonnel = (typeof FONCTIONS_PERSONNEL)[number];
