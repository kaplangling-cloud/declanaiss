import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LIBELLE_ROLE, useAuth } from '../lib/auth';
import { SyncIndicator } from './SyncIndicator';

const NAV: Record<string, { to: string; label: string }[]> = {
  PERSONNEL_SANTE: [
    { to: '/centre', label: 'Tableau de bord' }, { to: '/centre/nouvelle', label: 'Nouvelle déclaration' }, { to: '/centre/synchronisation', label: 'Synchronisation' },
  ],
  CHEF_CENTRE: [
    { to: '/centre', label: 'Tableau de bord' }, { to: '/centre/nouvelle', label: 'Nouvelle déclaration' }, { to: '/centre/synchronisation', label: 'Synchronisation' },
    { to: '/centre/personnel', label: 'Personnel' }, { to: '/stats', label: 'Statistiques' },
  ],
  OFFICIER_ETAT_CIVIL: [{ to: '/mairie', label: 'Déclarations reçues' }, { to: '/mairie/actes', label: 'Actes' }, { to: '/stats', label: 'Statistiques' }],
  SECRETAIRE_MAIRIE: [{ to: '/mairie', label: 'Déclarations reçues' }, { to: '/mairie/actes', label: 'Actes' }, { to: '/stats', label: 'Statistiques' }],
  ADMIN_NATIONAL: [
    { to: '/admin', label: 'Supervision' }, { to: '/admin/centres', label: 'Centres & mairies' }, { to: '/admin/utilisateurs', label: 'Comptes' },
    { to: '/admin/audit', label: "Journal d'audit" }, { to: '/stats', label: 'Statistiques' },
  ],
};

export function Layout() {
  const { utilisateur, deconnecter } = useAuth();
  const navigate = useNavigate();
  if (!utilisateur) return null;
  const liens = NAV[utilisateur.role] ?? [];
  const rattachement = utilisateur.centre?.nom ?? utilisateur.mairie?.nom ?? 'National';

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-primary-700 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1"><img src="/logo.png" alt="Logo" className="h-full w-full object-contain" /></div>
            <div>
              <div className="text-sm font-semibold leading-tight">Déclaration de naissance en ligne</div>
              <div className="text-xs text-primary-100">{rattachement}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(utilisateur.role === 'PERSONNEL_SANTE' || utilisateur.role === 'CHEF_CENTRE') && <SyncIndicator />}
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium">{utilisateur.nomComplet}</div>
              <div className="text-primary-100">{LIBELLE_ROLE[utilisateur.role]}</div>
            </div>
            <button className="rounded-lg bg-primary-800 px-3 py-1.5 text-xs hover:bg-primary-900" onClick={() => deconnecter().then(() => navigate('/connexion'))}>
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="border-t border-primary-600 bg-primary-600">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {liens.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/centre' || l.to === '/mairie' || l.to === '/admin'}
                className={({ isActive }) => `whitespace-nowrap px-3 py-2 text-sm ${isActive ? 'border-b-2 border-white font-medium' : 'text-primary-100 hover:text-white'}`}>
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-gray-400">
        République du Cameroun — Paix · Travail · Patrie · <a className="underline" href="/verifier" target="_blank" rel="noreferrer">Vérifier un acte</a>
      </footer>
    </div>
  );
}
