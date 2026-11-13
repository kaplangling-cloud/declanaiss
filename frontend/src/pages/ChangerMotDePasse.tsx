import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alerte } from '../components/ui';
import { ChampMotDePasse } from '../components/ChampMotDePasse';
import { AIDE_MOT_DE_PASSE, defautsMotDePasse, erreurMotDePasse } from '../lib/mot-de-passe';

export default function ChangerMotDePasse() {
  const { utilisateur, deconnecter } = useAuth();
  const navigate = useNavigate();
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null);
    if (nouveau !== confirmation) return setErreur('Les deux saisies ne correspondent pas');
    const nonConforme = erreurMotDePasse(nouveau);
    if (nonConforme) return setErreur(nonConforme);
    try {
      await api('/auth/mot-de-passe', { method: 'POST', body: { ancienMotDePasse: ancien, nouveauMotDePasse: nouveau } });
      setOk(true);
      // Les sessions sont invalidees cote serveur : reconnexion necessaire
      setTimeout(() => deconnecter().then(() => navigate('/connexion')), 1500);
    } catch (err) { setErreur((err as Error).message); }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4">Changer le mot de passe</h1>
      {utilisateur?.doitChangerMotDePasse && <div className="mb-4"><Alerte type="avert">Première connexion : vous devez définir un nouveau mot de passe avant de continuer.</Alerte></div>}
      <form onSubmit={soumettre} className="card space-y-4">
        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        {ok && <Alerte type="succes">Mot de passe modifié. Reconnexion…</Alerte>}
        <div><label htmlFor="ancien">Mot de passe actuel</label><ChampMotDePasse id="ancien" autoComplete="current-password" value={ancien} onChange={(e) => setAncien(e.target.value)} required /></div>
        <div><label htmlFor="nouveau">Nouveau mot de passe</label><ChampMotDePasse id="nouveau" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required />
          <p className={`mt-1 text-xs ${nouveau && defautsMotDePasse(nouveau).length ? 'text-amber-700' : 'text-gray-500'}`}>
            {nouveau && defautsMotDePasse(nouveau).length ? `Il manque : ${defautsMotDePasse(nouveau).join(', ')}.` : AIDE_MOT_DE_PASSE}
          </p>
        </div>
        <div><label htmlFor="confirmation">Confirmation</label><ChampMotDePasse id="confirmation" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></div>
        <button className="btn-primary w-full">Enregistrer</button>
      </form>
    </div>
  );
}
