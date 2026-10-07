import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Statut } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export const LIBELLE_STATUT: Record<Statut, string> = {
  BROUILLON: 'Brouillon', SOUMISE: 'Soumise', VALIDEE: 'Validée par la mairie', REJETEE: 'Renvoyée pour correction', VERROUILLEE: 'Verrouillée',
};
const COULEUR_STATUT: Record<Statut, string> = {
  BROUILLON: 'bg-gray-100 text-gray-700', SOUMISE: 'bg-blue-50 text-blue-700', VALIDEE: 'bg-primary-100 text-primary-800',
  REJETEE: 'bg-red-50 text-red-700', VERROUILLEE: 'bg-amber-50 text-amber-800',
};

export function StatutBadge({ statut }: { statut: Statut }) {
  return <span className={`badge ${COULEUR_STATUT[statut]}`}>{LIBELLE_STATUT[statut]}</span>;
}

export function Champ({ label, erreur, children, aide, obligatoire }: { label: string; erreur?: string; children: ReactNode; aide?: string; obligatoire?: boolean }) {
  return (
    <div>
      <label>{label}{obligatoire && <span className="text-red-500"> *</span>}</label>
      {children}
      {aide && !erreur && <p className="mt-1 text-xs text-gray-500">{aide}</p>}
      {erreur && <p className="erreur">{erreur}</p>}
    </div>
  );
}

export function Alerte({ type = 'info', children }: { type?: 'info' | 'succes' | 'erreur' | 'avert'; children: ReactNode }) {
  const c = { info: 'bg-blue-50 text-blue-800 border-blue-200', succes: 'bg-primary-50 text-primary-800 border-primary-200', erreur: 'bg-red-50 text-red-800 border-red-200', avert: 'bg-amber-50 text-amber-800 border-amber-200' }[type];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

/**
 * Tuile d'indicateur. Avec `onClick`, elle devient un bouton (ex. filtrer la liste
 * sur le statut compte) ; `actif` signale le filtre en cours.
 */
export function Tuile({ titre, valeur, sous, accent, icone: Icone, onClick, actif }: {
  titre: string; valeur: ReactNode; sous?: string; accent?: boolean; icone?: LucideIcon; onClick?: () => void; actif?: boolean;
}) {
  const contenu = (
    <div className="flex items-start gap-3">
      {Icone && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent || actif ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'}`}>
          <Icone className="h-5 w-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{titre}</div>
        <div className="mt-1 text-3xl font-semibold text-primary-800">{valeur}</div>
        {sous && <div className="mt-1 text-xs text-gray-500">{sous}</div>}
      </div>
    </div>
  );
  const cadre = `card ${accent ? 'border-primary-300 bg-primary-50' : ''} ${actif ? 'ring-2 ring-primary-500' : ''}`;
  if (!onClick) return <div className={cadre}>{contenu}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`${cadre} w-full text-left transition hover:border-primary-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500`}>
      {contenu}
    </button>
  );
}

export const fmtDate = (v?: string | Date | null, avecHeure = false) => v ? format(new Date(v), avecHeure ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy', { locale: fr }) : '—';
export const fmtDateLongue = (v?: string | Date | null) => v ? format(new Date(v), 'd MMMM yyyy', { locale: fr }) : '—';

export function Modale({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFermer}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2>{titre}</h2><button className="btn-ghost px-2 py-1" onClick={onFermer}>✕</button></div>
        {children}
      </div>
    </div>
  );
}
