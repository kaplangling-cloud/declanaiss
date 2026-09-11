export type Role = 'PERSONNEL_SANTE' | 'CHEF_CENTRE' | 'OFFICIER_ETAT_CIVIL' | 'SECRETAIRE_MAIRIE' | 'ADMIN_NATIONAL';
export type Sexe = 'MASCULIN' | 'FEMININ';
export type ModeAccouchement = 'VOIE_BASSE' | 'CESARIENNE';
export type TermeGrossesse = 'A_TERME' | 'PREMATURE';
export type Statut = 'BROUILLON' | 'SOUMISE' | 'VALIDEE' | 'REJETEE' | 'VERROUILLEE';
export type TypePiece = 'CNI_PERE' | 'CNI_MERE' | 'ACTE_MARIAGE_PARENTS' | 'AUTRE';

export interface Utilisateur {
  id: string;
  email: string;
  role: Role;
  centreId: string | null;
  mairieId: string | null;
  nomComplet: string;
  doitChangerMotDePasse?: boolean;
  centre?: { id: string; nom: string; code: string } | null;
  mairie?: { id: string; nom: string; code: string } | null;
}

/** Charge utile d'une declaration (miroir de DeclarationPayloadDto). */
export interface DeclarationPayload {
  enfantNom?: string;
  enfantPrenoms?: string;
  enfantSexe?: Sexe;
  enfantDateNaissance?: string;
  enfantHeureNaissance?: string;
  modeAccouchement?: ModeAccouchement;
  termeGrossesse?: TermeGrossesse;
  moisGrossesse?: number;
  poidsNaissanceGrammes?: number;

  pereNom?: string; perePrenoms?: string; pereProfession?: string; pereDomicile?: string; pereNationalite?: string;
  pereDateNaissance?: string; pereLieuNaissance?: string; pereCniNumero?: string; pereCniDateDelivrance?: string;

  mereNom?: string; merePrenoms?: string; mereProfession?: string; mereDomicile?: string; mereNationalite?: string;
  mereDateNaissance?: string; mereLieuNaissance?: string; mereCniNumero?: string; mereCniDateDelivrance?: string;

  personnelAccoucheurId?: string;
  declarantEstPersonnel?: boolean;
  declarantNom?: string; declarantPrenoms?: string; declarantQualite?: string; declarantContact?: string;

  donneesComplementaires?: Record<string, unknown>;
}

export interface Declaration extends DeclarationPayload {
  id: string;
  clientUuid: string;
  numeroDeclaration: string | null;
  statut: Statut;
  version: number;
  centreId: string;
  mairieId: string;
  dateSoumission: string | null;
  dateLimiteModification: string | null;
  dateVerrouillage: string | null;
  dateValidation: string | null;
  dateRejet: string | null;
  motifRejet: string | null;
  createdAt: string;
  updatedAt: string;
  centre?: { id: string; code: string; nom: string };
  mairie?: { id: string; code: string; nom: string };
  accoucheur?: { id: string; nom: string; prenoms: string; fonction: string } | null;
  creePar?: { id: string; nom: string; prenoms: string };
  acte?: { id: string; numeroActe: string; dateDressage: string } | null;
  piecesJointes?: PieceJointe[];
  rectifications?: Rectification[];
  _count?: { piecesJointes: number; rectifications: number };
}

export interface PieceJointe { id: string; type: TypePiece; nomOriginal: string; mimeType: string; tailleOctets: number; createdAt: string }

export interface Rectification {
  id: string; statut: 'DEMANDEE' | 'APPROUVEE' | 'APPLIQUEE' | 'REFUSEE'; motif: string; champsCibles: string[];
  valeursAvant: Record<string, unknown> | null; valeursApres: Record<string, unknown> | null; referenceLegale: string | null;
  createdAt: string; decideLe: string | null; commentaireDecision: string | null;
  demandePar?: { nom: string; prenoms: string }; decidePar?: { nom: string; prenoms: string } | null;
}

export interface PersonnelSante { id: string; nom: string; prenoms: string; fonction: string; numeroOrdre: string | null; habilite: boolean; user?: { id: string; email: string; actif: boolean } | null }

/** Element de la file de synchronisation locale (IndexedDB). */
export interface BrouillonLocal {
  clientUuid: string;
  serveurId?: string;
  versionBase: number;           // version serveur connue (0 = jamais synchronise)
  payload: DeclarationPayload;
  action: 'ENREGISTRER' | 'SOUMETTRE';
  statutLocal: 'A_SYNCHRONISER' | 'SYNCHRONISE' | 'CONFLIT' | 'ERREUR';
  saisieLe: string;
  modifieLe: string;
  message?: string;
  erreurs?: string[];
  serveur?: Declaration;         // etat serveur en cas de conflit
  statutServeur?: Statut;
  numeroDeclaration?: string | null;
}
