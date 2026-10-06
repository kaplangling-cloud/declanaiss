import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { brouillons } from '../lib/db';
import { sync } from '../lib/sync';

/** Etat reseau + file de synchronisation, visible en permanence dans l'en-tete. */
export function SyncIndicator() {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [compte, setCompte] = useState({ aSynchroniser: 0, conflits: 0, erreurs: 0 });
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    const maj = () => { void brouillons.compter().then(setCompte); setEnCours(sync.enCours); };
    maj();
    const on = () => { setEnLigne(true); maj(); };
    const off = () => { setEnLigne(false); maj(); };
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const desabonner = sync.abonner(maj);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); desabonner(); };
  }, []);

  const total = compte.aSynchroniser + compte.conflits + compte.erreurs;
  return (
    <Link to="/centre/synchronisation" className="flex items-center gap-2 rounded-lg bg-primary-800 px-2.5 py-1.5 text-xs hover:bg-primary-900 sm:px-3" title="File de synchronisation">
      <span className={`h-2 w-2 rounded-full ${enLigne ? 'bg-green-300' : 'bg-amber-400'}`} />
      {/* Sur mobile, la pastille seule ; l'etat reste lu par les lecteurs d'ecran */}
      <span className="sr-only sm:not-sr-only">{enLigne ? (enCours ? 'Synchronisation…' : 'En ligne') : 'Hors ligne'}</span>
      {total > 0 && (
        <span className={`rounded-full px-1.5 ${compte.conflits || compte.erreurs ? 'bg-amber-400 text-primary-900' : 'bg-white text-primary-800'}`}>{total}</span>
      )}
    </Link>
  );
}
