import { BadRequestException } from '@nestjs/common';
import { Declaration, TermeGrossesse } from '@prisma/client';
import { differenceInYears, isAfter, isValid, startOfDay } from 'date-fns';

const AGE_PARENT_MIN = 15;
const AGE_PARENT_MAX = 90;

type Champs = Partial<Declaration> & { pereCniNumero?: string | null; mereCniNumero?: string | null };

/**
 * Regles de completude et de coherence appliquees a la soumission.
 * Les memes regles sont reproduites cote client (validation temps reel) ;
 * le serveur reste l'autorite.
 */
export function validerPourSoumission(d: Champs): void {
  const erreurs: string[] = [];
  const manque = (champ: string, lib: string) => {
    const v = (d as any)[champ];
    if (v === null || v === undefined || v === '') erreurs.push(`${lib} est obligatoire`);
  };

  // --- Enfant ---
  manque('enfantNom', "Nom de l'enfant");
  manque('enfantPrenoms', "Prenom(s) de l'enfant");
  manque('enfantSexe', 'Sexe');
  manque('enfantDateNaissance', 'Date de naissance');
  manque('enfantHeureNaissance', 'Heure de naissance');
  manque('modeAccouchement', "Mode d'accouchement");
  manque('termeGrossesse', 'Terme de la grossesse');
  manque('poidsNaissanceGrammes', 'Poids de naissance');
  if (d.termeGrossesse === TermeGrossesse.PREMATURE && !d.moisGrossesse) {
    erreurs.push('Nombre de mois de grossesse obligatoire pour un premature');
  }
  if (d.termeGrossesse === TermeGrossesse.PREMATURE && d.moisGrossesse && d.moisGrossesse >= 9) {
    erreurs.push('Un accouchement a 9 mois ou plus est a terme');
  }

  const aujourdHui = startOfDay(new Date());
  const naissance = d.enfantDateNaissance ? new Date(d.enfantDateNaissance) : null;
  if (naissance && (!isValid(naissance) || isAfter(startOfDay(naissance), aujourdHui))) {
    erreurs.push('La date de naissance ne peut pas etre dans le futur');
  }

  // --- Parents ---
  for (const [prefixe, lib] of [['pere', 'Pere'], ['mere', 'Mere']] as const) {
    manque(`${prefixe}Nom`, `${lib} : nom`);
    manque(`${prefixe}Prenoms`, `${lib} : prenom(s)`);
    manque(`${prefixe}Profession`, `${lib} : profession`);
    manque(`${prefixe}Domicile`, `${lib} : domicile`);
    manque(`${prefixe}Nationalite`, `${lib} : nationalite`);
    manque(`${prefixe}DateNaissance`, `${lib} : date de naissance`);
    manque(`${prefixe}LieuNaissance`, `${lib} : lieu de naissance`);
    manque(`${prefixe}CniNumero`, `${lib} : numero de CNI`);
    manque(`${prefixe}CniDateDelivrance`, `${lib} : date de delivrance de la CNI`);

    const dn = (d as any)[`${prefixe}DateNaissance`];
    const dateParent = dn ? new Date(dn) : null;
    if (dateParent && isValid(dateParent)) {
      if (isAfter(startOfDay(dateParent), aujourdHui)) erreurs.push(`${lib} : date de naissance dans le futur`);
      if (naissance && isValid(naissance)) {
        const age = differenceInYears(naissance, dateParent);
        if (age < AGE_PARENT_MIN) erreurs.push(`${lib} : age a la naissance de l'enfant incoherent (${age} ans, minimum ${AGE_PARENT_MIN})`);
        if (age > AGE_PARENT_MAX) erreurs.push(`${lib} : age a la naissance de l'enfant incoherent (${age} ans)`);
      }
    }
    const dc = (d as any)[`${prefixe}CniDateDelivrance`];
    const dateCni = dc ? new Date(dc) : null;
    if (dateCni && isValid(dateCni)) {
      if (isAfter(startOfDay(dateCni), aujourdHui)) erreurs.push(`${lib} : date de delivrance de la CNI dans le futur`);
      if (dateParent && isValid(dateParent) && isAfter(dateParent, dateCni)) {
        erreurs.push(`${lib} : CNI delivree avant la naissance du parent`);
      }
    }
  }

  // --- Personnel / declarant ---
  manque('personnelAccoucheurId', "Personnel ayant effectue l'accouchement");
  if (d.declarantEstPersonnel === false) {
    manque('declarantNom', 'Declarant : nom');
    manque('declarantPrenoms', 'Declarant : prenom(s)');
    manque('declarantQualite', 'Declarant : qualite');
  }

  if (erreurs.length) {
    throw new BadRequestException({ message: 'Declaration incomplete ou incoherente', code: 'VALIDATION_METIER', erreurs });
  }
}
