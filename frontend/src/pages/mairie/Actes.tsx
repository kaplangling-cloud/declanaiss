import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtDate } from '../../components/ui';

interface Acte { id: string; numeroActe: string; anneeRegistre: number; dateDressage: string; officierNomComplet: string; nbImpressions: number; declaration: { id: string; numeroDeclaration: string; enfantNom: string; enfantPrenoms: string; enfantDateNaissance: string; centre: { nom: string } } }

export default function Actes() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const { data } = useQuery({ queryKey: ['actes', annee], queryFn: () => api<Acte[]>(`/actes?annee=${annee}`) });
  const ouvrir = async (id: string) => { const b = await api<Blob>(`/actes/${id}/pdf`, { brut: true }); window.open(URL.createObjectURL(b), '_blank'); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1>Registre des actes</h1><input type="number" className="input w-28" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} /></div>
      <div className="card">
        <table className="table"><thead><tr><th>N° acte</th><th>Enfant</th><th>Né(e) le</th><th>Centre</th><th>Dressé le</th><th>Officier</th><th>Impr.</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((a) => (
            <tr key={a.id}>
              <td className="font-mono text-xs">{a.numeroActe}</td><td>{a.declaration.enfantNom} {a.declaration.enfantPrenoms}</td><td>{fmtDate(a.declaration.enfantDateNaissance)}</td>
              <td className="text-xs">{a.declaration.centre.nom}</td><td>{fmtDate(a.dateDressage)}</td><td className="text-xs">{a.officierNomComplet}</td><td>{a.nbImpressions}</td>
              <td className="space-x-2 text-right"><button className="text-primary-700 underline" onClick={() => ouvrir(a.id)}>PDF</button><Link className="text-primary-700 underline" to={`/declarations/${a.declaration.id}`}>Fiche</Link></td>
            </tr>))}
            {data && data.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-400">Aucun acte pour {annee}</td></tr>}
          </tbody></table>
      </div>
    </div>
  );
}
