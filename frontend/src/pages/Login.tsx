import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Alerte } from '../components/ui';
import { ChampMotDePasse } from '../components/ChampMotDePasse';

export default function Login() {
  const { utilisateur, connecter } = useAuth();
  const navigate = useNavigate();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  if (utilisateur) return <Navigate to="/" replace />;

  const soumettre = async (e: FormEvent) => {
    e.preventDefault(); setErreur(null); setEnCours(true);
    try { await connecter(identifiant, motDePasse); navigate('/'); }
    catch (err) { setErreur((err as Error).message || 'Connexion impossible'); }
    finally { setEnCours(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-3 h-24 w-24 object-contain" />
          <h1 className="font-titre uppercase tracking-wide">Déclaration de naissance en ligne</h1>
          <p className="text-sm text-gray-500">Centres de santé → Mairies</p>
        </div>
        <form onSubmit={soumettre} className="card space-y-4">
          {erreur && <Alerte type="erreur">{erreur}</Alerte>}
          {!navigator.onLine && <Alerte type="avert">Vous êtes hors ligne : la connexion nécessite le réseau. Une session déjà ouverte reste utilisable.</Alerte>}
          <div><label htmlFor="identifiant">Adresse e-mail ou nom d'utilisateur</label><input id="identifiant" className="input" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} required /></div>
          <div>
            <label htmlFor="motDePasse">Mot de passe</label>
            <ChampMotDePasse id="motDePasse" autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
            <p className="mt-2 text-right text-xs">
              <Link to="/mot-de-passe-oublie" className="text-primary-700 underline">Mot de passe oublié ?</Link>
            </p>
          </div>
          <button className="btn-primary w-full" disabled={enCours}>{enCours ? 'Connexion…' : 'Se connecter'}</button>
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">
          Vous souhaitez vérifier l'authenticité d'un acte ? <Link to="/verifier" className="text-primary-700 underline">Page de vérification publique</Link>
        </p>
      </div>
    </div>
  );
}
