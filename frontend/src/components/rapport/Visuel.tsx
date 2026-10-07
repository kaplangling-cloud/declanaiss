import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

/**
 * Cadre d'un visuel de rapport (a la maniere de Power BI) : titre, sous-titre et
 * bascule « Afficher sous forme de tableau ». La vue tableau est l'equivalent
 * accessible du graphique : toute valeur y reste lisible sans survol.
 */
export function Visuel({ titre, sousTitre, tableau, children, className = '' }: {
  titre: string; sousTitre?: string; tableau: ReactNode; children: ReactNode; className?: string;
}) {
  const [vueTableau, setVueTableau] = useState(false);
  return (
    <section className={`card flex flex-col ${className}`} aria-label={titre}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2>{titre}</h2>
          {sousTitre && <p className="mt-1 text-xs text-gray-500">{sousTitre}</p>}
        </div>
        <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-xs" onClick={() => setVueTableau((v) => !v)} aria-pressed={vueTableau}
          title={vueTableau ? 'Afficher le graphique' : 'Afficher sous forme de tableau'}>
          {vueTableau ? <BarChart3 className="h-4 w-4" aria-hidden /> : <Table2 className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">{vueTableau ? 'Graphique' : 'Tableau'}</span>
        </button>
      </div>
      <div className="min-w-0 flex-1">{vueTableau ? <div className="table-defilante">{tableau}</div> : children}</div>
    </section>
  );
}
