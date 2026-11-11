import { z } from 'zod';
import { fr } from 'zod/locales';
import { differenceInYears, isAfter, startOfDay } from 'date-fns';

/**
 * Validation temps reel du formulaire (miroir des regles serveur
 * `declarations.validation.ts`). Le serveur reste l'autorite.
 */

// Messages par defaut de zod en francais : les controles sans message explicite
// (longueurs, bornes, valeur d'enumeration inconnue) sont des libelles
// d'interface, ils ne peuvent pas rester en anglais.
z.config(fr());

/**
 * Une enumeration doit distinguer l'absence de choix de la valeur inconnue.
 * zod 4 applique `error` aux deux : on ne renseigne donc que le premier cas et
 * on rend `undefined` pour le second, ce qui laisse le message de la locale.
 */
const choix = <T extends readonly [string, ...string[]]>(valeurs: T, lib: string) =>
  z.enum(valeurs, { error: absent(`${lib} obligatoire`) });
/**
 * zod 4 a fusionne `required_error` et `invalid_type_error` dans `error`, mais
 * un `error` pose sur le schema sert aussi de repli a **tous** ses controles
 * sans message propre : une chaine de 101 caracteres annoncerait « est
 * obligatoire » au lieu d'une erreur de longueur. On ne traite donc que
 * l'absence de valeur, et on rend `undefined` ailleurs pour laisser parler la
 * locale.
 */
const absent = (message: string) => (probleme: { input: unknown }) =>
  probleme.input === undefined ? message : undefined;

const requis = (lib: string) =>
  z.string({ error: absent(`${lib} est obligatoire`) }).trim().min(1, `${lib} est obligatoire`);
const dateIso = (lib: string) => requis(lib).regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');
const pasFutur = (lib: string) => dateIso(lib).refine((v) => !isAfter(startOfDay(new Date(v)), startOfDay(new Date())), `${lib} ne peut pas etre dans le futur`);

const parent = (lib: string) => ({
  Nom: requis(`${lib} : nom`).max(100),
  Prenoms: requis(`${lib} : prenom(s)`).max(150),
  Profession: requis(`${lib} : profession`).max(100),
  Domicile: requis(`${lib} : domicile`).max(200),
  Nationalite: requis(`${lib} : nationalite`).max(60),
  DateNaissance: pasFutur(`${lib} : date de naissance`),
  LieuNaissance: requis(`${lib} : lieu de naissance`).max(150),
  CniNumero: requis(`${lib} : numero de CNI`).max(40),
  CniDateDelivrance: pasFutur(`${lib} : date de delivrance de la CNI`),
});

const prefixer = (p: 'pere' | 'mere', o: ReturnType<typeof parent>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));

export const etapeEnfant = z.object({
  enfantNom: requis("Nom de l'enfant").max(100),
  enfantPrenoms: requis("Prenom(s) de l'enfant").max(150),
  enfantSexe: choix(['MASCULIN', 'FEMININ'], 'Sexe'),
  enfantDateNaissance: pasFutur('La date de naissance'),
  enfantHeureNaissance: requis('Heure de naissance').regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM'),
  modeAccouchement: choix(['VOIE_BASSE', 'CESARIENNE'], "Mode d'accouchement"),
  termeGrossesse: choix(['A_TERME', 'PREMATURE'], 'Terme'),
  moisGrossesse: z.coerce.number().int().min(4).max(8).optional(),
  // `z.coerce.number()` transforme une valeur absente ou vide en NaN : le repli
  // porte donc sur ces formes, et non sur `undefined` seul. Un nombre bien forme
  // mais non entier garde le message de la locale.
  poidsNaissanceGrammes: z.coerce
    .number({
      error: (probleme) =>
        probleme.input === undefined ||
        probleme.input === null ||
        probleme.input === '' ||
        (typeof probleme.input === 'number' && Number.isNaN(probleme.input))
          ? 'Poids obligatoire'
          : undefined,
    })
    .int()
    .min(300, 'Poids minimal 300 g')
    .max(8000, 'Poids maximal 8000 g'),
}).refine((d) => d.termeGrossesse !== 'PREMATURE' || !!d.moisGrossesse, { message: 'Nombre de mois obligatoire pour un premature', path: ['moisGrossesse'] });

export const etapePere = z.object(prefixer('pere', parent('Pere')) as Record<`pere${keyof ReturnType<typeof parent>}`, z.ZodString>);
export const etapeMere = z.object(prefixer('mere', parent('Mere')) as Record<`mere${keyof ReturnType<typeof parent>}`, z.ZodString>);

export const etapePersonnel = z.object({
  personnelAccoucheurId: requis("Personnel ayant effectue l'accouchement").uuid('Selectionnez un personnel'),
  declarantEstPersonnel: z.boolean().default(true),
  declarantNom: z.string().trim().max(100).optional(),
  declarantPrenoms: z.string().trim().max(150).optional(),
  declarantQualite: z.string().trim().max(100).optional(),
  declarantContact: z.string().trim().max(60).optional(),
}).superRefine((d, ctx) => {
  if (!d.declarantEstPersonnel) {
    if (!d.declarantNom) ctx.addIssue({ code: 'custom', path: ['declarantNom'], message: 'Nom du declarant obligatoire' });
    if (!d.declarantPrenoms) ctx.addIssue({ code: 'custom', path: ['declarantPrenoms'], message: 'Prenom(s) du declarant obligatoire' });
    if (!d.declarantQualite) ctx.addIssue({ code: 'custom', path: ['declarantQualite'], message: 'Qualite du declarant obligatoire' });
  }
});

/** Schema complet avec les regles croisees (age des parents a la naissance). */
export const declarationComplete = etapeEnfant.and(etapePere).and(etapeMere).and(etapePersonnel).superRefine((d, ctx) => {
  const naissance = new Date(d.enfantDateNaissance);
  for (const [p, lib] of [['pere', 'Pere'], ['mere', 'Mere']] as const) {
    const dn = (d as any)[`${p}DateNaissance`];
    const dc = (d as any)[`${p}CniDateDelivrance`];
    if (dn) {
      const age = differenceInYears(naissance, new Date(dn));
      if (age < 15) ctx.addIssue({ code: 'custom', path: [`${p}DateNaissance`], message: `${lib} : age a la naissance de l'enfant incoherent (${age} ans)` });
      if (age > 90) ctx.addIssue({ code: 'custom', path: [`${p}DateNaissance`], message: `${lib} : age incoherent (${age} ans)` });
      if (dc && isAfter(new Date(dn), new Date(dc))) ctx.addIssue({ code: 'custom', path: [`${p}CniDateDelivrance`], message: `${lib} : CNI delivree avant la naissance` });
    }
  }
});

export const etapes = [
  { id: 'enfant', titre: 'Enfant', schema: etapeEnfant },
  { id: 'pere', titre: 'Père', schema: etapePere },
  { id: 'mere', titre: 'Mère', schema: etapeMere },
  { id: 'personnel', titre: 'Personnel & déclarant', schema: etapePersonnel },
  { id: 'pieces', titre: 'Pièces & récapitulatif', schema: z.object({}) },
] as const;
