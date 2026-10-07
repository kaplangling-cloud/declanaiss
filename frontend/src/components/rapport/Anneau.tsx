import { useInfobulle } from './infobulle-contexte';
import { ENCRE } from './palette';
import { nombreFr, pourcent } from './outils';

export interface Part { cle: string; libelle: string; valeur: number; couleur: string }

/**
 * Graphique en anneau (part du tout), reserve a peu de classes (6 au plus).
 * Les segments sont separes par un espace de la couleur du fond ; le total est
 * au centre ; la legende, toujours presente, donne valeur et pourcentage.
 */
export function Anneau({ parts, libelleTotal }: { parts: Part[]; libelleTotal: string }) {
  const infobulle = useInfobulle();
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  const R = 70; const r = 46; const C = 80;
  let angle = -Math.PI / 2;
  const visibles = parts.filter((p) => p.valeur > 0);
  const arcs = visibles.map((p) => {
    const a0 = angle; const a1 = angle + (p.valeur / total) * Math.PI * 2; angle = a1;
    const pt = (rr: number, a: number) => `${C + rr * Math.cos(a)},${C + rr * Math.sin(a)}`;
    const grand = a1 - a0 > Math.PI ? 1 : 0;
    // Segment unique : anneau complet (un arc de 360° ne se trace pas)
    const d = visibles.length === 1
      ? `M${C - R},${C} a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0 M${C - r},${C} a${r},${r} 0 1,1 ${r * 2},0 a${r},${r} 0 1,1 ${-r * 2},0 Z`
      : `M${pt(R, a0)} A${R},${R} 0 ${grand} 1 ${pt(R, a1)} L${pt(r, a1)} A${r},${r} 0 ${grand} 0 ${pt(r, a0)} Z`;
    return { ...p, d };
  });
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg width={160} height={160} viewBox="0 0 160 160" role="img" aria-label={`${libelleTotal} : ${parts.map((p) => `${p.libelle} ${p.valeur}`).join(', ')}`}>
        {total === 0 && <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={ENCRE.quadrillage} strokeWidth={R - r} />}
        {arcs.map((a) => (
          <path key={a.cle} d={a.d} fill={a.couleur} fillRule="evenodd" stroke={ENCRE.surface} strokeWidth={2} tabIndex={0} className="outline-none hover:opacity-85 focus-visible:opacity-85"
            aria-label={`${a.libelle} : ${a.valeur} (${pourcent(a.valeur, total)})`}
            {...infobulle(a.libelle, [{ libelle: 'dossiers', valeur: `${nombreFr(a.valeur)} (${pourcent(a.valeur, total)})`, couleur: a.couleur }])} />
        ))}
        <text x={C} y={C - 4} textAnchor="middle" fontSize={22} fontWeight={600} fill={ENCRE.primaire}>{nombreFr(total)}</text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={11} fill={ENCRE.discrete}>{libelleTotal}</text>
      </svg>
      <ul className="min-w-40 space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.cle} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.couleur }} />
            <span className="flex-1 text-gray-700">{p.libelle}</span>
            <span className="font-medium tabular-nums text-gray-900">{nombreFr(p.valeur)}</span>
            <span className="w-11 text-right text-xs tabular-nums text-gray-500">{pourcent(p.valeur, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TableauParts({ parts, intitule }: { parts: Part[]; intitule: string }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  return (
    <table className="table">
      <thead><tr><th>{intitule}</th><th className="text-right">Nombre</th><th className="text-right">Part</th></tr></thead>
      <tbody>{parts.map((p) => <tr key={p.cle}><td>{p.libelle}</td><td className="text-right">{nombreFr(p.valeur)}</td><td className="text-right">{pourcent(p.valeur, total)}</td></tr>)}</tbody>
    </table>
  );
}
