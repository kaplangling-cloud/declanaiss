import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Alerte } from '../components/ui';
import { ChampMotDePasse } from '../components/ChampMotDePasse';
import { AIDE_MOT_DE_PASSE, defautsMotDePasse, erreurMotDePasse } from '../lib/mot-de-passe';

/**
 * Choix d'un nouveau mot de passe depuis le lien recu par courriel.
 * Le jeton vient de la barre d'adresse ; il n'est ni affiche ni conserve.
 */
export default function ReinitialiserMotDePasse() {
  const [params] = useSearchParams();
  const jeton = params.get('jeton') ?? '';
  const navigate = useNavigate();
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null);
    if (nouveau !== confirmation) return setErreur('Les deux saisies ne correspondent pas');
    const nonConforme = erreurMotDePasse(nouveau);
    if (nonConforme) return setErreur(nonConforme);
    setEnCours(true);
    try {
      await api('/auth/reinitialiser-mot-de-passe', { method: 'POST', body: { jeton, nouveauMotDePasse: nouveau } });
      setOk(true);
      setTimeout(() => navigate('/connexion'), 2000);
    } catch (err) {
      setErreur((err as Error).message);
    } finally { setEnCours(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <h1 className="font-titre uppercase tracking-wide">Nouveau mot de passe</h1>
        </div>

        {!jeton ? (
          <div className="card space-y-4">
            <Alerte type="erreur">Ce lien est incomplet : le jeton de réinitialisation est absent de l'adresse.</Alerte>
            <Link to="/mot-de-passe-oublie" className="btn-primary block text-center">Demander un nouveau lien</Link>
          </div>
        ) : (
          <form onSubmit={soumettre} className="card space-y-4">
            {erreur && <Alerte type="erreur">{erreur}</Alerte>}
            {ok && <Alerte type="succes">Mot de passe enregistré. Redirection vers la connexion…</Alerte>}
            <div>
              <label htmlFor="nouveau">Nouveau mot de passe</label>
              <ChampMotDePasse id="nouveau" autoComplete="new-password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required />
              <p className={`mt-1 text-xs ${nouveau && defautsMotDePasse(nouveau).length ? 'text-amber-700' : 'text-gray-500'}`}>
                {nouveau && defautsMotDePasse(nouveau).length ? `Il manque : ${defautsMotDePasse(nouveau).join(', ')}.` : AIDE_MOT_DE_PASSE}
              </p>
            </div>
            <div>
              <label htmlFor="confirmation">Confirmation</label>
              <ChampMotDePasse id="confirmation" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
            </div>
            <p className="text-xs text-gray-500">
              L'enregistrement ferme toutes les sessions ouvertes sur ce compte.
            </p>
            <button className="btn-primary w-full" disabled={enCours || ok}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
            <p className="text-center text-xs">
              <Link to="/mot-de-passe-oublie" className="text-primary-700 underline">Demander un nouveau lien</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
