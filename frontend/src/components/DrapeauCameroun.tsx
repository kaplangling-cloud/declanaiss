/**
 * Drapeau de la Republique du Cameroun, dessine en SVG (aucune ressource externe :
 * CSP de production et mode hors-ligne). Proportions 2:3, trois bandes verticales
 * egales vert / rouge / jaune, etoile jaune a cinq branches au centre de la bande rouge.
 */
const VERT = '#007A5E';
const ROUGE = '#CE1126';
const JAUNE = '#FCD116';

/** Etoile a cinq branches, pointe vers le haut, centree en (cx, cy). */
function pointsEtoile(cx: number, cy: number, rayon: number): string {
  const interieur = rayon * 0.382;   // rapport de l'etoile reguliere (pentagramme)
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? rayon : interieur;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

export function DrapeauCameroun({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" className={className} role="img" aria-label="Drapeau du Cameroun">
      <rect x="0" y="0" width="30" height="60" fill={VERT} />
      <rect x="30" y="0" width="30" height="60" fill={ROUGE} />
      <rect x="60" y="0" width="30" height="60" fill={JAUNE} />
      <polygon points={pointsEtoile(45, 30, 10.5)} fill={JAUNE} />
    </svg>
  );
}
