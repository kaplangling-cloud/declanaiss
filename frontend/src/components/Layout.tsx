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
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white p-1"><img src="/logo.png" alt="Logo" className="h-full w-full object-contain" /></div>
            <div>
              <div className="font-titre text-sm font-bold uppercase leading-tight tracking-wide">Déclaration de naissance en ligne</div>
              <div className="text-xs text-primary-100">{rattachement}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {(utilisateur.role === 'PERSONNEL_SANTE' || utilisateur.role === 'CHEF_CENTRE') && <SyncIndicator />}
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium">{utilisateur.nomComplet}</div>
              <div className="text-primary-100">{LIBELLE_ROLE[utilisateur.role]}</div>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-primary-800 px-3 py-1.5 text-xs hover:bg-primary-900" onClick={() => deconnecter().then(() => navigate('/connexion'))}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Déconnexion
            </button>
          </div>
        </div>
        <nav className="border-t border-primary-600 bg-primary-600">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4">
            {liens.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === '/centre' || l.to === '/mairie' || l.to === '/admin'}
                // Texte en gras et plus grand ; l'entree active se distingue par le soulignement blanc
                className={({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 font-titre text-base font-bold ${isActive ? 'border-b-[3px] border-white text-white' : 'text-primary-100 hover:text-white'}`}>
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
