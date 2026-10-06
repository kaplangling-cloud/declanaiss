import type { Statut } from '../types';
import { LIBELLE_STATUT } from './ui';

/**
 * Graphiques de bilan des tableaux de bord, dessines en CSS : aucune bibliotheque
 * externe, rendu identique hors-ligne. Chaque graphique porte un resume textuel
 * (aria-label) pour les lecteurs d'ecran.
 */

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const libelleMois = (cle: string) => MOIS_COURTS[Number(cle.slice(5, 7)) - 1] ?? cle;

/** Naissances par mois, en barres verticales (12 derniers mois, le mois en cours a droite). */
export function BarresMois({ donnees, titre = 'Naissances par mois' }: { donnees: { mois: string; total: number }[]; titre?: string }) {
  const max = Math.max(1, ...donnees.map((d) => d.total));
  const total = donnees.reduce((s, d) => s + d.total, 0);
  const resume = `${titre} : ${donnees.map((d) => `${libelleMois(d.mois)} ${d.mois.slice(0, 4)} ${d.total}`).join(', ')}`;
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2>{titre}</h2>
        <span className="text-sm text-gray-500"><span className="font-semibold text-primary-800 tabular-nums">{total}</span> sur 12 mois</span>
      </div>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label={resume}>
        {donnees.map((d, i) => {
          const courant = i === donnees.length - 1;
          return (
            <div key={d.mois} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${libelleMois(d.mois)} ${d.mois.slice(0, 4)} : ${d.total} naissance(s)`}>
              <span className="text-xs font-medium text-primary-800 tabular-nums">{d.total || ''}</span>
              <div
                className={`w-full rounded-t ${courant ? 'bg-primary-600' : 'bg-primary-300'}`}
                style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total ? 4 : 1 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5 border-t border-gray-100 pt-1" aria-hidden>
        {/* Sur mobile, les 12 libelles ne tiennent pas cote a cote : initiale du mois (J F M A...) */}
        {donnees.map((d) => (
          <span key={d.mois} className="min-w-0 flex-1 text-center text-[11px] text-gray-500">
            <span className="sm:hidden">{libelleMois(d.mois).charAt(0).toUpperCase()}</span>
            <span className="hidden sm:inline">{libelleMois(d.mois)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Couleurs des statuts, reprises des badges (cf. StatutBadge). */
const COULEUR_BARRE: Record<Statut, string> = {
  BROUILLON: 'bg-gray-300', SOUMISE: 'bg-blue-400', VERROUILLEE: 'bg-amber-400', VALIDEE: 'bg-primary-600', REJETEE: 'bg-red-400',
};
const ORDRE: Statut[] = ['BROUILLON', 'SOUMISE', 'VERROUILLEE', 'VALIDEE', 'REJETEE'];

/**
 * Repartition des dossiers par statut : barre empilee et legende chiffree. Un clic
 * sur une ligne de la legende peut filtrer la liste (onChoisir).
 */
export function RepartitionStatuts({ parStatut, statuts = ORDRE, onChoisir }: {
  parStatut: Partial<Record<Statut, number>>; statuts?: Statut[]; onChoisir?: (s: Statut) => void;
}) {
  const lignes = statuts.map((s) => ({ statut: s, total: parStatut[s] ?? 0 }));
  const total = lignes.reduce((s, l) => s + l.total, 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const resume = `Répartition par statut : ${lignes.map((l) => `${LIBELLE_STATUT[l.statut]} ${l.total}`).join(', ')}`;
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2>Répartition des dossiers</h2>
        <span className="text-sm text-gray-500"><span className="font-semibold text-primary-800 tabular-nums">{total}</span> au total</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={resume}>
        {lignes.filter((l) => l.total).map((l) => (
          <div key={l.statut} className={COULEUR_BARRE[l.statut]} style={{ width: `${(l.total / total) * 100}%` }} title={`${LIBELLE_STATUT[l.statut]} : ${l.total}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm">
        {lignes.map((l) => {
          const contenu = (
            <>
              <span className={`h-3 w-3 shrink-0 rounded-sm ${COULEUR_BARRE[l.statut]}`} />
              <span className="flex-1 text-left">{LIBELLE_STATUT[l.statut]}</span>
              <span className="font-medium tabular-nums">{l.total}</span>
              <span className="w-10 text-right text-xs text-gray-500 tabular-nums">{pct(l.total)} %</span>
            </>
          );
          return (
            <li key={l.statut}>
              {onChoisir
                ? <button type="button" className="flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-primary-50" onClick={() => onChoisir(l.statut)}>{contenu}</button>
                : <div className="flex items-center gap-2 px-1 py-0.5">{contenu}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
