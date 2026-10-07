import { useInfobulle } from './infobulle-contexte';
import { COULEUR_SERIE } from './palette';
import { nombreFr, pourcent } from './outils';

export interface LigneCentre { centre?: { id: string; code: string; nom: string }; total: number; poidsMoyen: number | null }

/**
 * Barres horizontales « naissances par centre », triees decroissant (les noms
 * longs se lisent mieux a l'horizontale). Serie unique : une seule couleur.
 * Clic sur une barre : filtre tout le rapport sur ce centre.
 */
export function BarresCentres({ lignes, onChoisir, actif }: { lignes: LigneCentre[]; onChoisir?: (id: string) => void; actif?: string }) {
  const infobulle = useInfobulle();
  const tries = [...lignes].sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...tries.map((l) => l.total));
  const total = tries.reduce((s, l) => s + l.total, 0);
  if (!tries.length) return <p className="py-16 text-center text-sm text-gray-500">Aucune naissance sur la période.</p>;
  return (
    <ul className="space-y-2.5">
      {tries.map((l) => {
        const nom = l.centre?.nom ?? 'Centre inconnu';
        const cliquable = !!onChoisir && !!l.centre;
        const contenu = (
          <>
            <span className="truncate text-left text-sm text-gray-700" title={nom}>{nom}</span>
            <span className="flex items-center gap-2">
              {/* Barre fine (20 px), extremite arrondie, ancree a gauche */}
              <span className="h-5 rounded-r" style={{ width: `${Math.max(2, (l.total / max) * 100)}%`, backgroundColor: COULEUR_SERIE, opacity: actif && actif !== l.centre?.id ? 0.35 : 1 }} />
              <span className="shrink-0 text-sm font-medium tabular-nums text-gray-900">{nombreFr(l.total)}</span>
            </span>
          </>
        );
        const survol = infobulle(nom, [{ libelle: 'naissances', valeur: `${nombreFr(l.total)} (${pourcent(l.total, total)})`, couleur: COULEUR_SERIE }]);
        return (
          <li key={l.centre?.id ?? nom}>
            {cliquable
              ? <button type="button" className="grid w-full grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 rounded px-1 py-0.5 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  onClick={() => onChoisir!(l.centre!.id)} aria-label={`${nom} : ${l.total} naissance(s), filtrer le rapport sur ce centre`} {...survol}>{contenu}</button>
              : <div className="grid grid-cols-[minmax(0,9rem)_1fr] sm:grid-cols-[minmax(0,15rem)_1fr] items-center gap-3 px-1 py-0.5" tabIndex={0} {...survol}>{contenu}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Matrice « detail par centre » avec barres de donnees (mise en forme
 * conditionnelle a la Power BI) et ligne de total.
 */
export function MatriceCentres({ lignes, poidsMoyen }: { lignes: LigneCentre[]; poidsMoyen: number | null }) {
  const tries = [...lignes].sort((a, b) => b.total - a.total);
  const total = tries.reduce((s, l) => s + l.total, 0);
  const max = Math.max(1, ...tries.map((l) => l.total));
  return (
    <table className="table">
      <thead><tr><th>Centre</th><th className="text-right">Naissances</th><th className="text-right">Part</th><th className="text-right">Poids moyen</th></tr></thead>
      <tbody>
        {tries.map((l) => (
          <tr key={l.centre?.id ?? 'inconnu'}>
            <td className="max-w-56 truncate" title={l.centre?.nom}>{l.centre?.nom ?? '—'}</td>
            <td className="relative text-right">
              {/* Barre de donnees : lavis de la couleur de serie derriere la valeur */}
              <span className="absolute inset-y-1.5 left-1 rounded-r" style={{ width: `calc(${(l.total / max) * 100}% - 0.5rem)`, backgroundColor: COULEUR_SERIE, opacity: 0.15 }} aria-hidden />
              <span className="relative font-medium">{nombreFr(l.total)}</span>
            </td>
            <td className="text-right">{pourcent(l.total, total)}</td>
            <td className="text-right">{l.poidsMoyen ? `${nombreFr(l.poidsMoyen)} g` : '—'}</td>
          </tr>
        ))}
        <tr className="bg-gray-50 font-semibold">
          <td>Total</td><td className="text-right">{nombreFr(total)}</td><td className="text-right">{total ? '100 %' : '—'}</td>
          <td className="text-right">{poidsMoyen ? `${nombreFr(poidsMoyen)} g` : '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}
