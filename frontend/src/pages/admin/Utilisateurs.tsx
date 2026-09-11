import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LIBELLE_ROLE } from '../../lib/auth';
import { Alerte, Modale, fmtDate } from '../../components/ui';
import type { Role } from '../../types';

interface U { id: string; email: string; nom: string; prenoms: string; role: Role; actif: boolean; derniereConnexion: string | null; centre?: { nom: string } | null; mairie?: { nom: string } | null }

export default function Utilisateurs() {
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [role, setRole] = useState<Role>('PERSONNEL_SANTE');
  const [erreur, setErreur] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['utilisateurs'], queryFn: () => api<U[]>('/utilisateurs') });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string }[]>('/centres') });
  const { data: mairies } = useQuery({ queryKey: ['mairies'], queryFn: () => api<{ id: string; nom: string }[]>('/mairies') });
  const creer = useMutation({ mutationFn: (body: Record<string, string>) => api('/utilisateurs', { method: 'POST', body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['utilisateurs'] }); setOuvert(false); setErreur(null); }, onError: (e) => setErreur((e as Error).message) });
  const basculer = useMutation({ mutationFn: (u: U) => api(`/utilisateurs/${u.id}`, { method: 'PATCH', body: { actif: !u.actif } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['utilisateurs'] }) });

  const soumettre = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    creer.mutate(Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()).filter(([, v]) => v !== '')) as Record<string, string>);
  };
  const besoinCentre = role === 'PERSONNEL_SANTE' || role === 'CHEF_CENTRE';
  const besoinMairie = role === 'OFFICIER_ETAT_CIVIL' || role === 'SECRETAIRE_MAIRIE';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1>Comptes utilisateurs</h1><button className="btn-primary" onClick={() => setOuvert(true)}>+ Nouveau compte</button></div>
      <div className="card">
        <table className="table"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Rattachement</th><th>Dernière connexion</th><th>Actif</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((u) => (
            <tr key={u.id}><td>{u.prenoms} {u.nom}</td><td className="text-xs">{u.email}</td><td className="text-xs">{LIBELLE_ROLE[u.role]}</td><td className="text-xs">{u.centre?.nom ?? u.mairie?.nom ?? 'National'}</td><td className="text-xs">{fmtDate(u.derniereConnexion, true)}</td><td>{u.actif ? 'Oui' : 'Non'}</td>
              <td className="text-right"><button className="btn-ghost text-xs" onClick={() => basculer.mutate(u)}>{u.actif ? 'Désactiver' : 'Réactiver'}</button></td></tr>))}</tbody></table>
      </div>
      {ouvert && (
        <Modale titre="Nouveau compte" onFermer={() => setOuvert(false)}>
          <form onSubmit={soumettre} className="space-y-3">{erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <div className="grid grid-cols-2 gap-3"><div><label>Nom</label><input name="nom" className="input" required /></div><div><label>Prénom(s)</label><input name="prenoms" className="input" required /></div></div>
            <div><label>E-mail</label><input name="email" type="email" className="input" required /></div>
            <div><label>Mot de passe initial (12 car. min., à changer à la 1ʳᵉ connexion)</label><input name="motDePasse" type="password" className="input" minLength={12} required /></div>
            <div><label>Rôle</label><select name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}</select></div>
            {besoinCentre && <div><label>Centre de santé</label><select name="centreId" className="input" required><option value="">—</option>{(centres ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>}
            {besoinMairie && <div><label>Mairie</label><select name="mairieId" className="input" required><option value="">—</option>{(mairies ?? []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOuvert(false)}>Annuler</button><button className="btn-primary" disabled={creer.isPending}>Créer</button></div>
          </form>
        </Modale>
      )}
    </div>
  );
}
