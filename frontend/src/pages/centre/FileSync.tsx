import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { brouillons } from '../../lib/db';
import { sync } from '../../lib/sync';
import { Alerte, fmtDate } from '../../components/ui';
import type { BrouillonLocal } from '../../types';

/** File de synchronisation visible + resolution des conflits de double-soumission. */
export default function FileSync() {
  const [liste, setListe] = useState<BrouillonLocal[]>([]);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { const maj = () => { void brouillons.tous().then(setListe); setEnCours(sync.enCours); }; maj(); return sync.abonner(maj); }, []);

  const Diff = ({ b }: { b: BrouillonLocal }) => {
    const s = b.serveur ?? {};
    const cles = Array.from(new Set([...Object.keys(b.payload), ...Object.keys(s)])).filter((k) => /^(enfant|pere|mere|mode|terme|mois|poids|declarant|personnel)/.test(k) && (b.payload as any)[k] !== (s as any)[k]);
    return (
      <table className="mt-2 w-full text-xs"><thead><tr><th className="text-left">Champ</th><th className="text-left">Version locale</th><th className="text-left">Version serveur</th></tr></thead>
        <tbody>{cles.map((k) => <tr key={k} className="border-t"><td className="py-1 font-mono">{k}</td><td>{String((b.payload as any)[k] ?? '—')}</td><td>{String((s as any)[k] ?? '—')}</td></tr>)}</tbody></table>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1>File de synchronisation</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => sync.retenter()} disabled={enCours || !navigator.onLine}>Réessayer les erreurs</button>
          <button className="btn-primary" onClick={() => sync.executer()} disabled={enCours || !navigator.onLine}>{enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}</button>
        </div>
      </div>
      {!navigator.onLine && <Alerte type="avert">Hors ligne : la synchronisation reprendra automatiquement au retour du réseau.</Alerte>}
      {liste.length === 0 && <Alerte type="succes">Tout est synchronisé. Aucune donnée en attente sur ce poste.</Alerte>}

      {liste.map((b) => (
        <div key={b.clientUuid} className={`card ${b.statutLocal === 'CONFLIT' ? 'border-amber-300' : b.statutLocal === 'ERREUR' ? 'border-red-300' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-medium">{b.payload.enfantNom ?? '(sans nom)'} {b.payload.enfantPrenoms ?? ''} <span className="ml-2 font-mono text-xs text-gray-400">{b.clientUuid.slice(0, 8)}</span></div>
              <div className="text-xs text-gray-500">Action : {b.action === 'SOUMETTRE' ? 'soumission' : 'enregistrement'} · saisi le {fmtDate(b.saisieLe, true)} · modifié le {fmtDate(b.modifieLe, true)}</div>
            </div>
            <span className={`badge ${b.statutLocal === 'CONFLIT' ? 'bg-amber-100 text-amber-800' : b.statutLocal === 'ERREUR' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>{b.statutLocal.replace('_', ' ')}</span>
          </div>
          {b.message && <p className="mt-2 text-sm text-gray-700">{b.message}</p>}
          {b.erreurs && <ul className="mt-1 list-disc pl-5 text-xs text-red-700">{b.erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>}

          {b.statutLocal === 'CONFLIT' && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Conflit : la déclaration a été modifiée ou soumise depuis un autre poste (statut serveur : {b.statutServeur}).</p>
              <Diff b={b} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => sync.resoudre(b.clientUuid, 'SERVEUR')}>Garder la version serveur (abandonner la mienne)</button>
                {b.statutServeur === 'BROUILLON' && <button className="btn-primary" onClick={() => sync.resoudre(b.clientUuid, 'LOCAL')}>Écraser avec ma version</button>}
                {b.serveurId && <Link className="btn-ghost" to={`/declarations/${b.serveurId}`}>Voir la fiche serveur</Link>}
              </div>
            </div>
          )}
          {b.statutLocal === 'ERREUR' && (
            <div className="mt-3 flex gap-2">
              <Link className="btn-secondary" to={`/centre/brouillons/${b.clientUuid}`}>Corriger</Link>
              <button className="btn-danger" onClick={() => brouillons.supprimer(b.clientUuid).then(() => brouillons.tous().then(setListe))}>Abandonner</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
