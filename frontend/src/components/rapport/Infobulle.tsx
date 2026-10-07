import { useCallback, useState, type ReactNode } from 'react';
import { ContexteInfobulle as Ctx, type ContenuInfobulle as Contenu } from './infobulle-contexte';

/**
 * Infobulle partagee par tous les visuels du rapport, comme dans Power BI.
 * Elle complete et ne remplace jamais : chaque valeur reste lisible dans la vue
 * tableau du visuel. Le meme contenu s'affiche au survol et au focus clavier.
 * Les libelles (noms de centres...) sont rendus comme texte React, jamais en HTML.
 */

export function FournisseurInfobulle({ children }: { children: ReactNode }) {
  const [contenu, setContenu] = useState<Contenu | null>(null);
  const montrer = useCallback((c: Contenu) => setContenu(c), []);
  const cacher = useCallback(() => setContenu(null), []);
  return (
    <Ctx.Provider value={{ montrer, cacher }}>
      {children}
      {contenu && (
        <div role="tooltip" className="pointer-events-none fixed z-50 min-w-40 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(contenu.x + 14, window.innerWidth - 220), top: Math.max(8, contenu.y - 12) }}>
          <div className="mb-1 text-xs text-gray-500">{contenu.titre}</div>
          {contenu.lignes.map((l) => (
            <div key={l.libelle} className="flex items-center gap-2">
              {/* Cle en trait court, pas en carre : a cette densite, la couleur designe, le texte informe */}
              {l.couleur && <span className="h-0.5 w-3 shrink-0 rounded" style={{ backgroundColor: l.couleur }} />}
              <span className="font-semibold text-gray-900 tabular-nums">{l.valeur}</span>
              <span className="text-gray-600">{l.libelle}</span>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
