import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alerte, Modale } from '../../components/ui';
import { FONCTIONS_PERSONNEL, type PersonnelSante } from '../../types';

export default function Personnel() {
  const { utilisateur, aRole } = useAuth();
  const qc = useQueryClient();
  const centreId = utilisateur?.centreId ?? '';
  const { data } = useQuery({ queryKey: ['personnel', centreId], queryFn: () => api<PersonnelSante[]>(`/centres/${centreId}/personnel`) });
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const creer = useMutation({
    mutationFn: (body: Record<string, string>) => api(`/centres/${centreId}/personnel`, { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['personnel', centreId] }); setOuvert(false); },
    onError: (e) => setErreur((e as Error).message),
  });
  const basculer = useMutation({
    mutationFn: (p: PersonnelSante) => api(`/centres/${centreId}/personnel/${p.id}`, { method: 'PATCH', body: { habilite: !p.habilite } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personnel', centreId] }),
  });

  const soumettre = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setErreur(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => v !== '')) as Record<string, string>;
    creer.mutate(body);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1>Personnel habilité à déclarer</h1>{aRole('CHEF_CENTRE') && <button className="btn-primary" onClick={() => setOuvert(true)}>+ Ajouter</button>}</div>
      <div className="card">
        <div className="table-defilante"><table className="table"><thead><tr><th>Nom</th><th>Fonction</th><th>N° d'ordre</th><th>Compte</th><th>Habilité</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((p) => (
            <tr key={p.id}>
              <td>{p.prenoms} {p.nom}</td><td>{p.fonction}</td><td className="font-mono text-xs">{p.numeroOrdre ?? '—'}</td>
              <td className="text-xs">{p.user ? `${p.user.email}${p.user.actif ? '' : ' (inactif)'}` : '—'}</td>
              <td><span className={`badge ${p.habilite ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-500'}`}>{p.habilite ? 'Oui' : 'Non'}</span></td>
              <td className="text-right">{aRole('CHEF_CENTRE') && <button className="btn-ghost text-xs" onClick={() => basculer.mutate(p)}>{p.habilite ? 'Retirer' : 'Rétablir'}</button>}</td>
            </tr>))}</tbody></table></div>
      </div>
      {ouvert && (
        <Modale titre="Ajouter un personnel" onFermer={() => setOuvert(false)}>
          <form onSubmit={soumettre} className="space-y-3">
            {erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <div className="grid grid-cols-2 gap-3">
              <div><label>Nom</label><input name="nom" className="input" required /></div>
              <div><label>Prénom(s)</label><input name="prenoms" className="input" required /></div>
            </div>
            <div><label>Fonction</label><select name="fonction" className="input" required defaultValue=""><option value="">—</option>{FONCTIONS_PERSONNEL.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label>N° d'ordre professionnel</label><input name="numeroOrdre" className="input" /></div>
              <div><label>Téléphone</label><input name="telephone" className="input" /></div>
            </div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOuvert(false)}>Annuler</button><button className="btn-primary" disabled={creer.isPending}>Enregistrer</button></div>
          </form>
        </Modale>
      )}
    </div>
  );
}
