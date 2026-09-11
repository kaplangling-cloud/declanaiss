import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { StatutBadge, Tuile, fmtDate } from '../../components/ui';
import type { Declaration, Statut } from '../../types';

/** Tableau de bord mairie : declarations recues, groupees par centre. */
export default function MairieDashboard() {
  const [statut, setStatut] = useState<Statut | ''>('SOUMISE');
  const [centreId, setCentreId] = useState('');
  const [recherche, setRecherche] = useState('');

  const { data: resume } = useQuery({ queryKey: ['resume'], queryFn: () => api<{ parStatut: Record<Statut, number> }>('/declarations/resume') });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string; code: string }[]>('/centres') });
  const { data } = useQuery({
    queryKey: ['declarations-mairie', statut, centreId, recherche],
    queryFn: () => api<{ lignes: Declaration[]; total: number }>(`/declarations?taille=100${statut ? `&statut=${statut}` : ''}${centreId ? `&centreId=${centreId}` : ''}${recherche ? `&recherche=${encodeURIComponent(recherche)}` : ''}`),
  });

  const ps = resume?.parStatut ?? ({} as Record<Statut, number>);
  const parCentre = (data?.lignes ?? []).reduce<Record<string, Declaration[]>>((acc, d) => { const k = d.centre?.nom ?? '—'; (acc[k] ??= []).push(d); return acc; }, {});

  return (
    <div className="space-y-6">
      <h1>Déclarations reçues</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile titre="À traiter" valeur={(ps.SOUMISE ?? 0) + (ps.VERROUILLEE ?? 0)} accent />
        <Tuile titre="Validées" valeur={ps.VALIDEE ?? 0} />
        <Tuile titre="Renvoyées pour correction" valeur={ps.REJETEE ?? 0} />
        <Tuile titre="Verrouillées (non traitées)" valeur={ps.VERROUILLEE ?? 0} />
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-3">
          <select className="input w-auto" value={statut} onChange={(e) => setStatut(e.target.value as Statut | '')}>
            <option value="">Tous statuts</option><option value="SOUMISE">Soumises</option><option value="VERROUILLEE">Verrouillées</option><option value="VALIDEE">Validées</option><option value="REJETEE">Renvoyées</option>
          </select>
          <select className="input w-auto" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
            <option value="">Tous les centres</option>{(centres ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <input className="input w-64" placeholder="Rechercher (n°, nom de l'enfant, parents)" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <span className="self-center text-sm text-gray-500">{data?.total ?? 0} résultat(s)</span>
        </div>

        {Object.entries(parCentre).map(([centre, lignes]) => (
          <div key={centre}>
            <h2 className="mb-2 text-base">{centre} <span className="text-sm font-normal text-gray-500">({lignes.length})</span></h2>
            <table className="table"><thead><tr><th>N° déclaration</th><th>Enfant</th><th>Né(e) le</th><th>Soumise le</th><th>Statut</th><th>Acte</th><th></th></tr></thead>
              <tbody>{lignes.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono text-xs">{d.numeroDeclaration}</td><td>{d.enfantNom} {d.enfantPrenoms}</td><td>{fmtDate(d.enfantDateNaissance)}</td><td className="text-xs">{fmtDate(d.dateSoumission, true)}</td>
                  <td><StatutBadge statut={d.statut} /></td><td className="font-mono text-xs">{d.acte?.numeroActe ?? '—'}</td>
                  <td className="text-right"><Link className="text-primary-700 underline" to={`/declarations/${d.id}`}>Traiter</Link></td>
                </tr>))}</tbody></table>
          </div>
        ))}
        {data && data.lignes.length === 0 && <p className="py-6 text-center text-gray-400">Aucune déclaration pour ces critères.</p>}
      </div>
    </div>
  );
}
