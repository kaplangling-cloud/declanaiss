import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LIBELLE_ROLE, useAuth } from '../../lib/auth';
import { Alerte, Modale, fmtDate } from '../../components/ui';
import { AIDE_MOT_DE_PASSE, erreurMotDePasse } from '../../lib/mot-de-passe';
import { FONCTIONS_PERSONNEL, type Role } from '../../types';

interface U {
  id: string; email: string; nomUtilisateur: string | null; nom: string; prenoms: string; telephone: string | null; role: Role; actif: boolean;
  centreId: string | null; mairieId: string | null; doitChangerMotDePasse: boolean; derniereConnexion: string | null;
  centre?: { nom: string } | null; mairie?: { nom: string } | null; personnelSante?: { id: string; fonction: string } | null;
}

const ROLES_CENTRE: Role[] = ['PERSONNEL_SANTE', 'CHEF_CENTRE'];
/** Miroir de backend/src/users/nom-utilisateur.ts (le serveur met en minuscules avant de verifier). */
const MOTIF_NOM_UTILISATEUR = '[A-Za-z0-9][A-Za-z0-9._\\-]{2,29}';
const AIDE_NOM_UTILISATEUR = "3 à 30 caractères : lettres sans accent, chiffres, point, tiret, tiret bas. Permet de se connecter sans l'adresse e-mail.";
const ROLES_MAIRIE: Role[] = ['OFFICIER_ETAT_CIVIL', 'SECRETAIRE_MAIRIE'];

/** Comptes utilisateurs : creation, modification et desactivation (administrateur national). */
export default function Utilisateurs() {
  const qc = useQueryClient();
  const { utilisateur: moi } = useAuth();
  const [creation, setCreation] = useState(false);
  const [edite, setEdite] = useState<U | null>(null);
  const [role, setRole] = useState<Role>('PERSONNEL_SANTE');
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['utilisateurs'], queryFn: () => api<U[]>('/utilisateurs') });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string }[]>('/centres') });
  const { data: mairies } = useQuery({ queryKey: ['mairies'], queryFn: () => api<{ id: string; nom: string }[]>('/mairies') });

  const fermer = () => { setCreation(false); setEdite(null); setErreur(null); };
  const apresSucces = (texte: string) => { qc.invalidateQueries({ queryKey: ['utilisateurs'] }); fermer(); setMessage(texte); };

  const creer = useMutation({
    mutationFn: (body: Record<string, string>) => api('/utilisateurs', { method: 'POST', body }),
    onSuccess: () => apresSucces('Compte créé. Le mot de passe initial devra être changé à la première connexion.'),
    onError: (e) => setErreur((e as Error).message),
  });
  const modifier = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/utilisateurs/${id}`, { method: 'PATCH', body }),
    onSuccess: (_r, { body }) => apresSucces(body.motDePasse
      ? 'Compte modifié. Mot de passe réinitialisé : ses sessions ouvertes sont fermées et il devra le changer à la prochaine connexion.'
      : 'Compte modifié.'),
    onError: (e) => setErreur((e as Error).message),
  });
  const basculer = useMutation({
    mutationFn: (u: U) => api(`/utilisateurs/${u.id}`, { method: 'PATCH', body: { actif: !u.actif } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['utilisateurs'] }),
    onError: (e) => setMessage(`Échec : ${(e as Error).message}`),
  });

  const ouvrirCreation = () => { setRole('PERSONNEL_SANTE'); setErreur(null); setMessage(null); setCreation(true); };
  const ouvrirEdition = (u: U) => { setRole(u.role); setErreur(null); setMessage(null); setEdite(u); };

  const soumettreCreation = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()).filter(([, v]) => v !== '')) as Record<string, string>;
    const nonConforme = erreurMotDePasse(body.motDePasse ?? '');
    if (nonConforme) return setErreur(nonConforme);
    creer.mutate(body);
  };

  /** N'envoie que ce qui change : le serveur refuse par ailleurs toute modification hors de ses regles. */
  const soumettreEdition = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!edite) return;
    const fd = new FormData(e.currentTarget);
    const texte = (k: string) => String(fd.get(k) ?? '').trim();
    const body: Record<string, unknown> = {};
    for (const k of ['nom', 'prenoms', 'email'] as const) if (texte(k) && texte(k) !== edite[k]) body[k] = texte(k);
    if (texte('telephone') !== (edite.telephone ?? '')) body.telephone = texte('telephone');
    const nomUtilisateur = texte('nomUtilisateur').toLowerCase();
    if (nomUtilisateur !== (edite.nomUtilisateur ?? '')) body.nomUtilisateur = nomUtilisateur || null;
    if (role !== edite.role) body.role = role;
    // Le rattachement suit le role : un compte de centre n'a pas de mairie, et inversement
    const centreId = ROLES_CENTRE.includes(role) ? texte('centreId') || null : null;
    const mairieId = ROLES_MAIRIE.includes(role) ? texte('mairieId') || null : null;
    if (centreId !== edite.centreId) body.centreId = centreId;
    if (mairieId !== edite.mairieId) body.mairieId = mairieId;
    const mdp = String(fd.get('motDePasse') ?? '');
    if (mdp) {
      const nonConforme = erreurMotDePasse(mdp);
      if (nonConforme) return setErreur(nonConforme);
      body.motDePasse = mdp;
    }
    const fonction = role === 'PERSONNEL_SANTE' ? texte('fonction') : '';
    if (fonction && fonction !== (edite.personnelSante?.fonction ?? '')) body.fonction = fonction;
    if (!Object.keys(body).length) return setErreur('Aucune modification');
    modifier.mutate({ id: edite.id, body });
  };

  // Fonctions de rendu, pas composants : declares dans la page, ils seraient recrees a chaque
  // rendu et les choix deja faits reviendraient a leur valeur initiale (ex. apres une erreur).
  const selecteurRattachement = ({ centreId, mairieId }: { centreId?: string | null; mairieId?: string | null } = {}) => (
    <>
      {ROLES_CENTRE.includes(role) && <div><label>Centre de santé</label><select name="centreId" className="input" required defaultValue={centreId ?? ''}><option value="">—</option>{(centres ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>}
      {ROLES_MAIRIE.includes(role) && <div><label>Mairie</label><select name="mairieId" className="input" required defaultValue={mairieId ?? ''}><option value="">—</option>{(mairies ?? []).map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div>}
    </>
  );
  /**
   * Fonction du personnel de sante. Une fonction anterieure hors liste reste affichee
   * et selectionnee : ouvrir le formulaire ne doit pas la modifier a l'insu de l'utilisateur.
   */
  const selecteurFonction = ({ actuelle }: { actuelle?: string | null } = {}) => {
    if (role !== 'PERSONNEL_SANTE') return null;
    const horsListe = actuelle && !(FONCTIONS_PERSONNEL as readonly string[]).includes(actuelle);
    return (
      <div><label>Fonction</label>
        <select name="fonction" className="input" required defaultValue={actuelle ?? ''}>
          <option value="">—</option>
          {FONCTIONS_PERSONNEL.map((f) => <option key={f} value={f}>{f}</option>)}
          {horsListe && <option value={actuelle}>{actuelle} (actuelle)</option>}
        </select>
        <p className="mt-1 text-xs text-gray-500">Portée sur la déclaration et sur l'acte ; l'agent est ajouté au personnel habilité du centre.</p>
      </div>
    );
  };

  const selecteurRole = () => (
    <div><label>Rôle</label><select name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{(Object.keys(LIBELLE_ROLE) as Role[]).map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}</select></div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1>Comptes utilisateurs</h1><button className="btn-primary" onClick={ouvrirCreation}>+ Nouveau compte</button></div>
      {message && <Alerte type={message.startsWith('Échec') ? 'erreur' : 'succes'}>{message}</Alerte>}
      <div className="card overflow-x-auto">
        <div className="table-defilante"><table className="table"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Rattachement</th><th>Dernière connexion</th><th>Actif</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((u) => (
            <tr key={u.id}>
              <td>{u.prenoms} {u.nom}{u.doitChangerMotDePasse && <div className="text-xs text-amber-700">mot de passe provisoire</div>}</td>
              <td className="text-xs">{u.email}{u.nomUtilisateur && <div className="font-mono text-gray-500">@{u.nomUtilisateur}</div>}</td><td className="text-xs">{LIBELLE_ROLE[u.role]}{u.personnelSante && <div className="text-gray-500">{u.personnelSante.fonction}</div>}</td><td className="text-xs">{u.centre?.nom ?? u.mairie?.nom ?? 'National'}</td>
              <td className="text-xs">{fmtDate(u.derniereConnexion, true)}</td><td>{u.actif ? 'Oui' : 'Non'}</td>
              <td className="space-x-1 whitespace-nowrap text-right">
                <button className="btn-ghost text-xs" onClick={() => ouvrirEdition(u)}>Modifier</button>
                {/* Le serveur refuse de desactiver son propre compte */}
                {u.id !== moi?.id && <button className="btn-ghost text-xs" onClick={() => basculer.mutate(u)}>{u.actif ? 'Désactiver' : 'Réactiver'}</button>}
              </td>
            </tr>))}</tbody></table></div>
      </div>

      {creation && (
        <Modale titre="Nouveau compte" onFermer={fermer}>
          <form onSubmit={soumettreCreation} className="space-y-3">{erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <div className="grid grid-cols-2 gap-3"><div><label>Nom</label><input name="nom" className="input" required /></div><div><label>Prénom(s)</label><input name="prenoms" className="input" required /></div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label>E-mail</label><input name="email" type="email" className="input" required /></div>
              <div><label>Nom d'utilisateur (facultatif)</label><input name="nomUtilisateur" className="input" pattern={MOTIF_NOM_UTILISATEUR} autoCapitalize="none" spellCheck={false} /></div>
            </div>
            <p className="-mt-1 text-xs text-gray-500">{AIDE_NOM_UTILISATEUR}</p>
            <div><label>Mot de passe initial (à changer à la 1ʳᵉ connexion)</label><input name="motDePasse" type="password" className="input" required autoComplete="new-password" />
              <p className="mt-1 text-xs text-gray-500">{AIDE_MOT_DE_PASSE}</p></div>
            {selecteurRole()}
            {selecteurRattachement()}
            {selecteurFonction()}
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={fermer}>Annuler</button><button className="btn-primary" disabled={creer.isPending}>Créer</button></div>
          </form>
        </Modale>
      )}

      {edite && (
        <Modale titre={`Modifier — ${edite.prenoms} ${edite.nom}`} onFermer={fermer}>
          <form onSubmit={soumettreEdition} className="space-y-3">{erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <div className="grid grid-cols-2 gap-3"><div><label>Nom</label><input name="nom" className="input" defaultValue={edite.nom} required /></div><div><label>Prénom(s)</label><input name="prenoms" className="input" defaultValue={edite.prenoms} required /></div></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label>E-mail (connexion)</label><input name="email" type="email" className="input" defaultValue={edite.email} required /></div>
              <div><label>Nom d'utilisateur</label><input name="nomUtilisateur" className="input" pattern={MOTIF_NOM_UTILISATEUR} autoCapitalize="none" spellCheck={false} defaultValue={edite.nomUtilisateur ?? ''} placeholder="aucun" /></div>
            </div>
            <p className="-mt-1 text-xs text-gray-500">{AIDE_NOM_UTILISATEUR} Vider le champ retire le nom d'utilisateur.</p>
            <div><label>Téléphone</label><input name="telephone" className="input" defaultValue={edite.telephone ?? ''} /></div>
            {selecteurRole()}
            {selecteurRattachement({ centreId: edite.centreId, mairieId: edite.mairieId })}
            {selecteurFonction({ actuelle: edite.personnelSante?.fonction })}
            <div><label>Nouveau mot de passe (facultatif)</label><input name="motDePasse" type="password" className="input" autoComplete="new-password" placeholder="Laisser vide pour ne pas le changer" />
              <p className="mt-1 text-xs text-gray-500">{AIDE_MOT_DE_PASSE} Réinitialiser ferme toutes les sessions du compte ; le nouveau mot de passe devra être changé à la connexion suivante.</p></div>
            {edite.id === moi?.id && role !== edite.role && <Alerte type="avert">Vous modifiez votre propre rôle : vous perdrez l'accès à cet écran.</Alerte>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={fermer}>Annuler</button><button className="btn-primary" disabled={modifier.isPending}>Enregistrer</button></div>
          </form>
        </Modale>
      )}
    </div>
  );
}
