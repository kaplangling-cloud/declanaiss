import { z } from 'zod';
import { differenceInYears, isAfter, startOfDay } from 'date-fns';

/**
 * Validation temps reel du formulaire (miroir des regles serveur
 * `declarations.validation.ts`). Le serveur reste l'autorite.
 */
const requis = (lib: string) => z.string({ required_error: `${lib} est obligatoire` }).trim().min(1, `${lib} est obligatoire`);
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
  enfantSexe: z.enum(['MASCULIN', 'FEMININ'], { required_error: 'Sexe obligatoire' }),
  enfantDateNaissance: pasFutur('La date de naissance'),
  enfantHeureNaissance: requis('Heure de naissance').regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM'),
  modeAccouchement: z.enum(['VOIE_BASSE', 'CESARIENNE'], { required_error: "Mode d'accouchement obligatoire" }),
  termeGrossesse: z.enum(['A_TERME', 'PREMATURE'], { required_error: 'Terme obligatoire' }),
  moisGrossesse: z.coerce.number().int().min(4).max(8).optional(),
  poidsNaissanceGrammes: z.coerce.number({ invalid_type_error: 'Poids obligatoire' }).int().min(300, 'Poids minimal 300 g').max(8000, 'Poids maximal 8000 g'),
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
