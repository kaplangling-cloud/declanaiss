import { createContext, useContext, type FocusEvent, type PointerEvent } from 'react';

/** Contexte de l'infobulle partagee (rendue par FournisseurInfobulle, cf. Infobulle.tsx). */
export interface LigneInfobulle { libelle: string; valeur: string; couleur?: string }
export interface ContenuInfobulle { titre: string; lignes: LigneInfobulle[]; x: number; y: number }

export const ContexteInfobulle = createContext<{ montrer: (c: ContenuInfobulle) => void; cacher: () => void } | null>(null);

/** Proprietes a poser sur une marque (barre, segment...) pour lui donner son infobulle, au survol comme au clavier. */
export function useInfobulle() {
  const ctx = useContext(ContexteInfobulle);
  return (titre: string, lignes: LigneInfobulle[]) => ({
    onPointerMove: (e: PointerEvent) => ctx?.montrer({ titre, lignes, x: e.clientX, y: e.clientY }),
    onPointerLeave: () => ctx?.cacher(),
    onFocus: (e: FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      ctx?.montrer({ titre, lignes, x: r.right, y: r.top });
    },
    onBlur: () => ctx?.cacher(),
  });
}
