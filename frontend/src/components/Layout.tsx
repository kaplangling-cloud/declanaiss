import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3, BookOpen, Building2, FilePlus2, Inbox, LayoutDashboard, LogOut, RefreshCw, ScrollText, ShieldCheck, Stethoscope, UserCog,
  type LucideIcon,
} from 'lucide-react';
import { LIBELLE_ROLE, useAuth } from '../lib/auth';
import { SyncIndicator } from './SyncIndicator';

const NAV: Record<string, { to: string; label: string; icone: LucideIcon }[]> = {
  PERSONNEL_SANTE: [
    { to: '/centre', label: 'Tableau de bord', icone: LayoutDashboard }, { to: '/centre/nouvelle', label: 'Nouvelle déclaration', icone: FilePlus2 },
    { to: '/centre/synchronisation', label: 'Synchronisation', icone: RefreshCw },
  ],
  CHEF_CENTRE: [
    { to: '/centre', label: 'Tableau de bord', icone: LayoutDashboard }, { to: '/centre/nouvelle', label: 'Nouvelle déclaration', icone: FilePlus2 },
    { to: '/centre/synchronisation', label: 'Synchronisation', icone: RefreshCw },
    { to: '/centre/personnel', label: 'Personnel', icone: Stethoscope }, { to: '/stats', label: 'Statistiques', icone: BarChart3 },
  ],
  OFFICIER_ETAT_CIVIL: [
    { to: '/mairie', label: 'Déclarations reçues', icone: Inbox }, { to: '/mairie/actes', label: 'Actes', icone: BookOpen }, { to: '/stats', label: 'Statistiques', icone: BarChart3 },
  ],
  SECRETAIRE_MAIRIE: [
    { to: '/mairie', label: 'Déclarations reçues', icone: Inbox }, { to: '/mairie/actes', label: 'Actes', icone: BookOpen }, { to: '/stats', label: 'Statistiques', icone: BarChart3 },
  ],
  ADMIN_NATIONAL: [
    { to: '/admin', label: 'Supervision', icone: ShieldCheck }, { to: '/admin/centres', label: 'Centres & mairies', icone: Building2 },
    { to: '/admin/utilisateurs', label: 'Comptes', icone: UserCog }, { to: '/admin/audit', label: "Journal d'audit", icone: ScrollText },
    { to: '/stats', label: 'Statistiques', icone: BarChart3 },
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
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white p-1"><img src="/logo.png" alt="Logo" className="h-full w-full object-contain" /></div>
            <div>
              <div className="font-titre text-sm font-bold uppercase leading-tight tracking-wide">Déclaration de naissance en ligne</div>
              <div className="text-xs text-primary-100">{rattachement}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            {(utilisateur.role === 'PERSONNEL_SANTE' || utilisateur.role === 'CHEF_CENTRE') && <SyncIndicator />}
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium">{utilisateur.nomComplet}</div>
              <div className="text-primary-100">{LIBELLE_ROLE[utilisateur.role]}</div>
            </div>
            {/* Sur mobile, l'icone seule ; le libelle reste lu par les lecteurs d'ecran */}
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary-800 px-2.5 py-1.5 text-xs hover:bg-primary-900 sm:px-3" title="Déconnexion" onClick={() => deconnecter().then(() => navigate('/connexion'))}>
              <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden /> <span className="sr-only sm:not-sr-only">Déconnexion</span>
            </button>
          </div>
        </div>
        <nav className="menu-barre">
          <div className="menu-liste mx-auto flex max-w-7xl overflow-x-auto px-4 py-2">
            {liens.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/centre' || l.to === '/mairie' || l.to === '/admin'}
                // Couleurs et espacements : variables --menu-* et classes .menu-* (index.css)
                className={({ isActive }) => `menu-lien inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-titre text-base font-bold ${isActive ? 'menu-lien-actif' : ''}`}>
                <l.icone className="h-5 w-5" aria-hidden />
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
