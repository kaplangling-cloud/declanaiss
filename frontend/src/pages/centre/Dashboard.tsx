import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { brouillons } from '../../lib/db';
import { sync } from '../../lib/sync';
import { Alerte, StatutBadge, Tuile, fmtDate } from '../../components/ui';
import type { BrouillonLocal, Declaration, Statut } from '../../types';

const ONGLETS: { cle: string; label: string; statuts: Statut[] }[] = [
  { cle: 'encours', label: 'En cours', statuts: ['BROUILLON', 'REJETEE'] },
  { cle: 'attente', label: 'En attente de validation mairie', statuts: ['SOUMISE'] },
  { cle: 'verrou', label: 'Verrouillées / validées', statuts: ['VERROUILLEE', 'VALIDEE'] },
];

export default function CentreDashboard() {
  const [onglet, setOnglet] = useState('encours');
  const [locaux, setLocaux] = useState<BrouillonLocal[]>([]);
  useEffect(() => { const maj = () => void brouillons.tous().then(setLocaux); maj(); return sync.abonner(maj); }, []);

  const { data: resume } = useQuery({ queryKey: ['resume'], queryFn: () => api<{ parStatut: Record<Statut, number>; bientotVerrouillees: number }>('/declarations/resume'), retry: false });
  const statuts = ONGLETS.find((o) => o.cle === onglet)!.statuts;
  const { data, isError } = useQuery({
    queryKey: ['declarations', onglet],
    queryFn: async () => {
      const r = await Promise.all(statuts.map((s) => api<{ lignes: Declaration[] }>(`/declarations?statut=${s}&taille=100`)));
      return r.flatMap((x) => x.lignes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    retry: false,
  });

  const ps = resume?.parStatut ?? ({} as Record<Statut, number>);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1>Tableau de bord du centre</h1><Link to="/centre/nouvelle" className="btn-primary">+ Nouvelle déclaration</Link></div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile titre="En cours (brouillons + à corriger)" valeur={(ps.BROUILLON ?? 0) + (ps.REJETEE ?? 0) + locaux.length} sous={locaux.length ? `${locaux.length} sur ce poste, non synchronisé(s)` : undefined} />
        <Tuile titre="En attente mairie" valeur={ps.SOUMISE ?? 0} sous={resume?.bientotVerrouillees ? `${resume.bientotVerrouillees} verrouillée(s) sous 48 h` : undefined} accent={!!resume?.bientotVerrouillees} />
        <Tuile titre="Validées" valeur={ps.VALIDEE ?? 0} />
        <Tuile titre="Verrouillées" valeur={ps.VERROUILLEE ?? 0} />
      </div>

      {isError && <Alerte type="avert">Serveur injoignable : seules les données locales sont affichées.</Alerte>}

      {locaux.length > 0 && onglet === 'encours' && (
        <div className="card">
          <h2 className="mb-3">Sur ce poste (non synchronisées)</h2>
          <table className="table"><thead><tr><th>Enfant</th><th>Né(e) le</th><th>État local</th><th>Modifié le</th><th></th></tr></thead>
            <tbody>{locaux.map((b) => (
              <tr key={b.clientUuid}>
                <td>{b.payload.enfantNom ?? '—'} {b.payload.enfantPrenoms ?? ''}</td><td>{fmtDate(b.payload.enfantDateNaissance)}</td>
                <td><span className={`badge ${b.statutLocal === 'CONFLIT' || b.statutLocal === 'ERREUR' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{b.statutLocal.replace('_', ' ').toLowerCase()}</span></td>
                <td>{fmtDate(b.modifieLe, true)}</td>
                <td className="text-right"><Link className="text-primary-700 underline" to={b.statutLocal === 'CONFLIT' ? '/centre/synchronisation' : `/centre/brouillons/${b.clientUuid}`}>{b.statutLocal === 'CONFLIT' ? 'Résoudre' : 'Ouvrir'}</Link></td>
              </tr>))}</tbody></table>
        </div>
      )}

      <div className="card">
        <div className="mb-3 flex flex-wrap gap-2">{ONGLETS.map((o) => <button key={o.cle} onClick={() => setOnglet(o.cle)} className={`rounded-full px-3 py-1 text-sm ${onglet === o.cle ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{o.label}</button>)}</div>
        <table className="table"><thead><tr><th>N° déclaration</th><th>Enfant</th><th>Né(e) le</th><th>Statut</th><th>Modifiable jusqu'au</th><th>Mis à jour</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td className="font-mono text-xs">{d.numeroDeclaration ?? '—'}</td><td>{d.enfantNom} {d.enfantPrenoms}</td><td>{fmtDate(d.enfantDateNaissance)}</td>
                <td><StatutBadge statut={d.statut} />{d.statut === 'REJETEE' && d.motifRejet && <div className="mt-1 text-xs text-red-700">{d.motifRejet}</div>}</td>
                <td className="text-xs">{d.statut === 'SOUMISE' ? fmtDate(d.dateLimiteModification, true) : '—'}</td><td className="text-xs">{fmtDate(d.updatedAt, true)}</td>
                <td className="text-right"><Link className="text-primary-700 underline" to={`/declarations/${d.id}`}>Fiche</Link></td>
              </tr>))}
            {data && data.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-400">Aucune déclaration</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}
