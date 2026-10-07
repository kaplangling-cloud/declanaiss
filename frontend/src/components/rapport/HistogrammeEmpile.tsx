import { COULEUR_MODE, ENCRE } from './palette';
import { graduations, libellePeriode, nombreFr, pourcent, useLargeur } from './outils';
import { useInfobulle } from './infobulle-contexte';

export interface PointPeriode { periode: string; total: number; voieBasse: number; cesarienne: number }

const SERIES = [
  { cle: 'voieBasse', libelle: 'Voie basse', couleur: COULEUR_MODE.VOIE_BASSE },
  { cle: 'cesarienne', libelle: 'Césarienne', couleur: COULEUR_MODE.CESARIENNE },
  { cle: 'nonRenseigne', libelle: 'Non renseigné', couleur: COULEUR_MODE.NON_RENSEIGNE },
] as const;

const HAUT = 220;     // zone de trace
const AXE_X = 28;     // bande des libelles de periode, comprise dans la hauteur du SVG
const MARGE_G = 36;   // graduations
const GAP = 2;        // espace (couleur du fond) entre segments empiles

/**
 * Histogramme empile « naissances par periode » : voie basse / cesarienne.
 * Clic (ou Entree) sur une colonne : filtre tout le rapport sur cette periode
 * (filtrage croise, comme dans Power BI).
 */
export function HistogrammeEmpile({ donnees, onChoisir }: { donnees: PointPeriode[]; onChoisir?: (periode: string) => void }) {
  const { ref, largeur } = useLargeur<HTMLDivElement>();
  const infobulle = useInfobulle();
  const lignes = donnees.map((d) => ({ ...d, nonRenseigne: Math.max(0, d.total - d.voieBasse - d.cesarienne) }));
  const series = SERIES.filter((s) => s.cle !== 'nonRenseigne' || lignes.some((l) => l.nonRenseigne > 0));
  const ticks = graduations(Math.max(1, ...lignes.map((l) => l.total)));
  const max = ticks[ticks.length - 1];
  const trace = Math.max(0, largeur - MARGE_G);
  const bande = lignes.length ? trace / lignes.length : 0;
  const epaisseur = Math.min(24, bande * 0.6);            // colonnes fines : l'air de la bande reste vide
  const y = (v: number) => HAUT - (v / max) * HAUT;
  // Etiquette de total : sur chaque chapeau si peu de colonnes, sinon sur le maximum seulement
  const maxTotal = Math.max(0, ...lignes.map((l) => l.total));
  const etiqueterTout = lignes.length <= 12;
  // Libelles d'axe : un sur k quand ils ne tiennent pas
  const pasLibelle = Math.max(1, Math.ceil(56 / Math.max(bande, 1)));

  return (
    <div>
      {/* Legende : toujours presente des deux series */}
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
        {series.map((s) => <li key={s.cle} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.couleur }} />{s.libelle}</li>)}
      </ul>
      <div ref={ref} className="w-full">
        {largeur > 0 && lignes.length === 0 && <p className="py-16 text-center text-sm text-gray-500">Aucune naissance sur la période.</p>}
        {largeur > 0 && lignes.length > 0 && (
          <svg width={largeur} height={HAUT + AXE_X + 8} role="img" aria-label={`Naissances par période : ${lignes.map((l) => `${libellePeriode(l.periode)} ${l.total}`).join(', ')}`}>
            <g transform="translate(0,8)">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={MARGE_G} x2={largeur} y1={y(t)} y2={y(t)} stroke={t === 0 ? ENCRE.axe : ENCRE.quadrillage} strokeWidth={1} />
                  <text x={MARGE_G - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={ENCRE.discrete} style={{ fontVariantNumeric: 'tabular-nums' }}>{nombreFr(t)}</text>
                </g>
              ))}
              {lignes.map((l, i) => {
                const x = MARGE_G + i * bande + (bande - epaisseur) / 2;
                let base = 0;
                const presents = series.filter((s) => l[s.cle] > 0);
                const titre = libellePeriode(l.periode);
                return (
                  <g key={l.periode}>
                    {/* Zone de clic et de survol : toute la bande, plus large que la colonne */}
                    <rect x={MARGE_G + i * bande} y={0} width={bande} height={HAUT} fill="transparent"
                      className={onChoisir ? 'cursor-pointer outline-none focus-visible:fill-blue-100' : ''} tabIndex={0}
                      role={onChoisir ? 'button' : undefined}
                      aria-label={`${titre} : ${l.total} naissance(s)${onChoisir ? ', filtrer le rapport sur cette période' : ''}`}
                      onClick={() => onChoisir?.(l.periode)}
                      onKeyDown={(e) => { if (onChoisir && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChoisir(l.periode); } }}
                      {...infobulle(titre, [
                        { libelle: 'naissances', valeur: nombreFr(l.total) },
                        ...series.map((s) => ({ libelle: s.libelle, valeur: `${nombreFr(l[s.cle])} (${pourcent(l[s.cle], l.total)})`, couleur: s.couleur })),
                      ])} />
                    {presents.map((s, k) => {
                      const h0 = (l[s.cle] / max) * HAUT;
                      const haut = k === presents.length - 1;
                      // Espace de 2 px entre segments ; extremite arrondie de 4 px en haut seulement
                      const h = Math.max(1, h0 - (k > 0 ? GAP : 0));
                      const yBas = y(base) - (k > 0 ? GAP : 0);
                      base += l[s.cle];
                      const r = haut ? Math.min(4, h, epaisseur / 2) : 0;
                      const path = `M${x},${yBas} V${yBas - h + r} Q${x},${yBas - h} ${x + r},${yBas - h} H${x + epaisseur - r} Q${x + epaisseur},${yBas - h} ${x + epaisseur},${yBas - h + r} V${yBas} Z`;
                      return <path key={s.cle} d={path} fill={s.couleur} pointerEvents="none" />;
                    })}
                    {(etiqueterTout || l.total === maxTotal) && l.total > 0 && (
                      <text x={x + epaisseur / 2} y={y(l.total) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill={ENCRE.secondaire} pointerEvents="none">{nombreFr(l.total)}</text>
                    )}
                    {i % pasLibelle === 0 && (
                      <text x={x + epaisseur / 2} y={HAUT + 16} textAnchor="middle" fontSize={11} fill={ENCRE.discrete} pointerEvents="none">{libellePeriode(l.periode, true)}</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

export function TableauPeriodes({ donnees }: { donnees: PointPeriode[] }) {
  return (
    <table className="table">
      <thead><tr><th>Période</th><th className="text-right">Naissances</th><th className="text-right">Voie basse</th><th className="text-right">Césarienne</th></tr></thead>
      <tbody>{donnees.map((d) => (
        <tr key={d.periode}><td>{libellePeriode(d.periode)}</td><td className="text-right">{nombreFr(d.total)}</td><td className="text-right">{nombreFr(d.voieBasse)}</td><td className="text-right">{nombreFr(d.cesarienne)}</td></tr>
      ))}</tbody>
    </table>
  );
}
