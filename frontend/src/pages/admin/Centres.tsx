import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Alerte, Modale, fmtDate } from '../../components/ui';

interface Geo { id: string; code: string; nom: string; departements: { id: string; code: string; nom: string; arrondissements: { id: string; code: string; nom: string; codeEtatCivil: string | null }[] }[] }
interface Mairie { id: string; code: string; nom: string; actif: boolean; region: { nom: string }; arrondissement: { nom: string }; _count: { centres: number; declarations: number; actes: number } }
interface Centre { id: string; code: string; nom: string; adresse: string; numeroAutorisation: string; autorisationDateDelivrance: string; autorisationDateFinValidite: string | null; chefNom: string; chefFonction: string; chefContact: string; actif: boolean; mairie: { nom: string }; region: { nom: string }; _count: { personnels: number; declarations: number } }

/** Gestion des centres de sante et des mairies rattachees (admin national). */
export default function Centres() {
  const qc = useQueryClient();
  const [modale, setModale] = useState<'centre' | 'mairie' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regionId, setRegionId] = useState(''); const [departementId, setDepartementId] = useState(''); const [arrondissementId, setArrondissementId] = useState('');
  const { data: geo } = useQuery({ queryKey: ['referentiel'], queryFn: () => api<Geo[]>('/mairies/referentiel') });
  const { data: mairies } = useQuery({ queryKey: ['mairies'], queryFn: () => api<Mairie[]>('/mairies') });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<Centre[]>('/centres') });

  const creer = useMutation({
    mutationFn: ({ chemin, body }: { chemin: string; body: Record<string, string> }) => api(chemin, { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['centres'] }); qc.invalidateQueries({ queryKey: ['mairies'] }); setModale(null); setErreur(null); },
    onError: (e) => setErreur((e as Error).message),
  });
  const basculer = useMutation({
    mutationFn: ({ chemin, actif }: { chemin: string; actif: boolean }) => api(chemin, { method: 'PATCH', body: { actif } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['centres'] }); qc.invalidateQueries({ queryKey: ['mairies'] }); },
  });

  const soumettre = (chemin: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()).filter(([, v]) => v !== '')) as Record<string, string>;
    creer.mutate({ chemin, body });
  };
  const region = geo?.find((r) => r.id === regionId); const departement = region?.departements.find((d) => d.id === departementId);
  const arrondissement = departement?.arrondissements.find((a) => a.id === arrondissementId);
  const ouvrir = (m: 'centre' | 'mairie') => { setRegionId(''); setDepartementId(''); setArrondissementId(''); setErreur(null); setModale(m); };
  const SelecteurGeo = () => (
    <div className="grid grid-cols-3 gap-3">
      <div><label>Région</label><select name="regionId" className="input" required value={regionId} onChange={(e) => { setRegionId(e.target.value); setDepartementId(''); setArrondissementId(''); }}><option value="">—</option>{(geo ?? []).map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select></div>
      <div><label>Département</label><select name="departementId" className="input" required value={departementId} onChange={(e) => { setDepartementId(e.target.value); setArrondissementId(''); }}><option value="">—</option>{(region?.departements ?? []).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select></div>
      <div><label>Arrondissement</label><select name="arrondissementId" className="input" required value={arrondissementId} onChange={(e) => setArrondissementId(e.target.value)}><option value="">—</option>{(departement?.arrondissements ?? []).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1>Centres de santé & mairies</h1><div className="flex gap-2"><button className="btn-secondary" onClick={() => ouvrir('mairie')}>+ Mairie</button><button className="btn-primary" onClick={() => ouvrir('centre')}>+ Centre de santé</button></div></div>

      <div className="card"><h2 className="mb-2">Centres de santé</h2>
        <table className="table"><thead><tr><th>Code</th><th>Centre</th><th>Autorisation</th><th>Chef</th><th>Mairie</th><th>Décl.</th><th>Actif</th><th></th></tr></thead>
          <tbody>{(centres ?? []).map((c) => (
            <tr key={c.id}><td className="font-mono text-xs">{c.code}</td><td>{c.nom}<div className="text-xs text-gray-400">{c.adresse}</div></td>
              <td className="text-xs">{c.numeroAutorisation}<div className="text-gray-400">{fmtDate(c.autorisationDateDelivrance)} → {fmtDate(c.autorisationDateFinValidite)}</div></td>
              <td className="text-xs">{c.chefNom}<div className="text-gray-400">{c.chefFonction} · {c.chefContact}</div></td><td className="text-xs">{c.mairie.nom}</td><td>{c._count.declarations}</td><td>{c.actif ? 'Oui' : 'Non'}</td>
              <td className="text-right"><button className="btn-ghost text-xs" onClick={() => basculer.mutate({ chemin: `/centres/${c.id}`, actif: !c.actif })}>{c.actif ? 'Désactiver' : 'Réactiver'}</button></td></tr>))}</tbody></table>
      </div>
      <div className="card"><h2 className="mb-2">Mairies (centres d'état civil)</h2>
        <table className="table"><thead><tr><th>Code</th><th>Mairie</th><th>Localisation</th><th>Centres</th><th>Décl.</th><th>Actes</th><th>Actif</th><th></th></tr></thead>
          <tbody>{(mairies ?? []).map((m) => (
            <tr key={m.id}><td className="font-mono text-xs">{m.code}</td><td>{m.nom}</td><td className="text-xs">{m.arrondissement.nom}, {m.region.nom}</td><td>{m._count.centres}</td><td>{m._count.declarations}</td><td>{m._count.actes}</td><td>{m.actif ? 'Oui' : 'Non'}</td>
              <td className="text-right"><button className="btn-ghost text-xs" onClick={() => basculer.mutate({ chemin: `/mairies/${m.id}`, actif: !m.actif })}>{m.actif ? 'Désactiver' : 'Réactiver'}</button></td></tr>))}</tbody></table>
      </div>

      {modale === 'mairie' && (
        <Modale titre="Nouvelle mairie" onFermer={() => setModale(null)}>
          <form onSubmit={soumettre('/mairies')} className="space-y-3">{erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <SelecteurGeo />
            <div className="grid grid-cols-3 gap-3">
              <div><label>Code</label><input className="input font-mono" value={arrondissement?.codeEtatCivil ?? ''} placeholder="calculé" readOnly tabIndex={-1} /></div>
              <div className="col-span-2"><label>Nom</label><input name="nom" className="input" placeholder={arrondissement ? `Centre d'état civil de ${arrondissement.nom}` : "Centre d'état civil de …"} /></div>
            </div>
            <p className="text-xs text-gray-500">Code attribué automatiquement selon le découpage administratif (RDC.xlsx) : région (2 chiffres) + département (3) + arrondissement (3). Sans nom saisi, la dénomination proposée est retenue.</p>
            <div className="grid grid-cols-3 gap-3"><div><label>Adresse</label><input name="adresse" className="input" /></div><div><label>Téléphone</label><input name="telephone" className="input" /></div><div><label>E-mail</label><input name="email" type="email" className="input" /></div></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModale(null)}>Annuler</button><button className="btn-primary">Créer</button></div>
          </form>
        </Modale>
      )}
      {modale === 'centre' && (
        <Modale titre="Nouveau centre de santé" onFermer={() => setModale(null)}>
          <form onSubmit={soumettre('/centres')} className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">{erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <div className="grid grid-cols-3 gap-3"><div><label>Code</label><input name="code" className="input font-mono" pattern="[A-Z0-9]{2,10}" required /></div><div className="col-span-2"><label>Nom du centre</label><input name="nom" className="input" required /></div></div>
            <div><label>Adresse</label><input name="adresse" className="input" required /></div>
            <div className="grid grid-cols-3 gap-3"><div><label>N° d'autorisation</label><input name="numeroAutorisation" className="input" required /></div><div><label>Délivrée le</label><input type="date" name="autorisationDateDelivrance" className="input" required /></div><div><label>Valide jusqu'au</label><input type="date" name="autorisationDateFinValidite" className="input" /></div></div>
            <SelecteurGeo />
            <div><label>Mairie de rattachement</label><select name="mairieId" className="input" required><option value="">—</option>{(mairies ?? []).filter((m) => m.actif).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div>
            <div className="grid grid-cols-3 gap-3"><div><label>Chef du centre</label><input name="chefNom" className="input" required /></div><div><label>Fonction</label><input name="chefFonction" className="input" required /></div><div><label>Contact</label><input name="chefContact" className="input" required /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><label>Téléphone</label><input name="telephone" className="input" /></div><div><label>E-mail</label><input name="email" type="email" className="input" /></div></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModale(null)}>Annuler</button><button className="btn-primary">Créer</button></div>
          </form>
        </Modale>
      )}
    </div>
  );
}
