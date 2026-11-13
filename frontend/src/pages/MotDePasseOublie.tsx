import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Alerte } from '../components/ui';

/**
 * Demande d'un lien de reinitialisation.
 *
 * Le serveur repond la meme chose que le compte existe ou non : l'ecran
 * affiche donc une confirmation neutre, sans jamais confirmer qu'une adresse
 * est enregistree.
 */
export default function MotDePasseOublie() {
  const [identifiant, setIdentifiant] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const soumettre = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null); setEnCours(true);
    try {
      const r = await api<{ message: string }>('/auth/mot-de-passe-oublie', { method: 'POST', body: { identifiant } });
      setMessage(r.message);
    } catch (err) {
      setErreur((err as Error).message || 'Demande impossible');
    } finally { setEnCours(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <h1 className="font-titre uppercase tracking-wide">Mot de passe oublié</h1>
        </div>

        {message ? (
          <div className="card space-y-4">
            <Alerte type="succes">{message}</Alerte>
            <p className="text-sm text-gray-600">
              Le lien reçu est valable 30 minutes et ne peut servir qu'une fois. Pensez à regarder les courriers
              indésirables. Si rien n'arrive, attendez une minute avant de redemander un lien.
            </p>
            <Link to="/connexion" className="btn-secondary block text-center">Retour à la connexion</Link>
          </div>
        ) : (
          <form onSubmit={soumettre} className="card space-y-4">
            {erreur && <Alerte type="erreur">{erreur}</Alerte>}
            <p className="text-sm text-gray-600">
              Indiquez votre adresse e-mail ou votre nom d'utilisateur. Un lien de réinitialisation sera envoyé à
              l'adresse enregistrée sur le compte.
            </p>
            <div>
              <label htmlFor="identifiant">Adresse e-mail ou nom d'utilisateur</label>
              <input
                id="identifiant" className="input" type="text" autoComplete="username" autoCapitalize="none"
                spellCheck={false} value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required
              />
            </div>
            <button className="btn-primary w-full" disabled={enCours}>{enCours ? 'Envoi…' : 'Envoyer le lien'}</button>
            <p className="text-center text-xs">
              <Link to="/connexion" className="text-primary-700 underline">Retour à la connexion</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
