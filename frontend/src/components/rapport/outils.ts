import { useEffect, useRef, useState } from 'react';

/** Largeur disponible d'un conteneur, pour dessiner les SVG a l'echelle reelle (texte net, pas de deformation). */
export function useLargeur<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.floor(e.contentRect.width)));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, largeur };
}

/**
 * Graduations « rondes » de 0 au maximum (0, 5, 10... / 0, 20, 40...). Les valeurs
 * sont des comptages : le pas ne descend jamais sous 1, sans quoi un maximum de 1 ou 2
 * donnait des graduations en double (0, 1, 1, 2, 2) une fois arrondies.
 */
export function graduations(max: number, nombre = 4): number[] {
  if (max <= 0) return [0, 1];
  const brut = max / nombre;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = Math.max(1, [1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? brut);
  const fin = Math.ceil(max / pas) * pas;
  const t: number[] = [];
  for (let v = 0; v <= fin + pas / 2; v += pas) t.push(Math.round(v));
  return t;
}

export const nombreFr = (n: number) => n.toLocaleString('fr-FR');
export const pourcent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : '—');

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2026-09 » -> « sept. 2026 » ; « 2026-09-12 » -> « 12 sept. » ; « 2026 » -> « 2026 ». */
export function libellePeriode(p: string, court = false): string {
  if (p.length === 4) return p;
  const mois = MOIS[Number(p.slice(5, 7)) - 1] ?? p;
  if (p.length === 7) return court ? `${mois} ${p.slice(2, 4)}` : `${mois} ${p.slice(0, 4)}`;
  return `${Number(p.slice(8, 10))} ${mois}`;
}
