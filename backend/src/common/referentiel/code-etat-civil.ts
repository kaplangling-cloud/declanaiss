/**
 * Code d'un centre d'etat civil (mairie), tel que defini par RDC.xlsx
 * (feuille « Communes », colonne « Code unique / Unique code ») :
 *
 *   {code region sur 2}{code departement sur 3}{code arrondissement sur 3}
 *   ex : Ngaoundal (R01, D01, A001) -> 01001001
 *
 * Les codes du referentiel sont stockes avec un prefixe (R09, D50, A309) ;
 * seule leur partie numerique entre dans le code de la mairie.
 */
export function codeCentreEtatCivil(codeRegion: string, codeDepartement: string, codeArrondissement: string): string {
  return [
    partieNumerique(codeRegion, 2, 'region'),
    partieNumerique(codeDepartement, 3, 'departement'),
    partieNumerique(codeArrondissement, 3, 'arrondissement'),
  ].join('');
}

/** Denomination par defaut, reprise de l'en-tete d'acte de RDC.xlsx. */
export function nomCentreEtatCivil(nomArrondissement: string): string {
  return `Centre d'état civil de ${nomArrondissement}`;
}

function partieNumerique(code: string, largeur: number, niveau: string): string {
  const m = /^[A-Z]?(\d+)$/i.exec(code.trim());
  if (!m || m[1].length > largeur) {
    throw new Error(`Code de ${niveau} non conforme au referentiel : « ${code} »`);
  }
  return m[1].padStart(largeur, '0');
}
