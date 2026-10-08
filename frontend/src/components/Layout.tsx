import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, BookOpen, Building2, FilePlus2, Inbox, LayoutDashboard, LogOut, Menu, RefreshCw, ScrollText, ShieldCheck, Stethoscope, UserCog, X,
  type LucideIcon,
} from 'lucide-react';
import { LIBELLE_ROLE, useAuth } from '../lib/auth';
import { SyncIndicator } from './SyncIndicator';
import { DrapeauCameroun } from './DrapeauCameroun';

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
  const { pathname } = useLocation();
  // Barre laterale en tiroir sous 768 px : fermee par defaut
  const [menuOuvert, setMenuOuvert] = useState(false);
  const boutonFermer = useRef<HTMLButtonElement>(null);
  const boutonMenu = useRef<HTMLButtonElement>(null);

  // Fermeture a chaque changement de page (clic sur un lien du menu)
  useEffect(() => { setMenuOuvert(false); }, [pathname]);
  // Passage au-dela de 768 px tiroir ouvert : on le ferme (sinon le defilement resterait bloque)
  useEffect(() => {
    const large = window.matchMedia('(min-width: 768px)');
    const surChangement = () => { if (large.matches) setMenuOuvert(false); };
    large.addEventListener('change', surChangement);
    return () => large.removeEventListener('change', surChangement);
  }, []);
  // Tiroir ouvert : Echap le ferme, la page derriere ne defile plus, le focus va sur la croix
  useEffect(() => {
    if (!menuOuvert) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOuvert(false); };
    document.addEventListener('keydown', surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Une image plus tard : le tiroir doit etre devenu visible pour recevoir le focus
    const image = requestAnimationFrame(() => boutonFermer.current?.focus());
    const declencheur = boutonMenu.current;
    return () => {
      cancelAnimationFrame(image);
      document.removeEventListener('keydown', surTouche);
      document.body.style.overflow = debordement;
      declencheur?.focus();   // le focus revient au bouton menu
    };
  }, [menuOuvert]);

  if (!utilisateur) return null;
  const liens = NAV[utilisateur.role] ?? [];
  // Centre ou mairie de l'utilisateur ; rien pour l'echelon national, deja nomme par le titre
  const rattachement = utilisateur.centre?.nom ?? utilisateur.mairie?.nom ?? null;

  return (
    <div className="min-h-screen bg-white">
      {/* Fond semi-transparent du tiroir (mobile) : un clic ferme le menu */}
      {menuOuvert && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuOuvert(false)} aria-hidden />}

      {/*
        Barre laterale fixe de 240 px (variables --menu-* d'index.css). Sous 768 px,
        elle devient un tiroir qui glisse depuis la gauche ; fermee, elle est invisible
        et hors de l'ordre de tabulation. La visibilite n'est animee qu'a la fermeture
        (le glissement reste visible jusqu'au bout) : a l'ouverture, le tiroir est
        visible tout de suite, pour pouvoir recevoir le focus.
      */}
      <aside id="menu-principal" aria-label="Menu principal"
        className={`menu-barre fixed inset-y-0 left-0 z-50 flex w-60 flex-col overflow-y-auto shadow-lg duration-200 ease-out md:visible md:translate-x-0 md:shadow-none ${menuOuvert ? 'visible translate-x-0 transition-transform' : 'invisible -translate-x-full transition-[transform,visibility]'}`}
        {...(menuOuvert ? { role: 'dialog', 'aria-modal': true } : {})}>
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm"><img src="/logo.png" alt="Logo" className="h-full w-full object-contain" /></div>
          <div className="min-w-0 flex-1 font-titre text-xs font-bold uppercase leading-tight tracking-wide text-primary-800">Déclaration de naissance en ligne</div>
          <button ref={boutonFermer} type="button" className="rounded-md p-1.5 text-primary-800 hover:bg-white/60 md:hidden" onClick={() => setMenuOuvert(false)} aria-label="Fermer le menu">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <nav className="menu-liste flex flex-col px-4 pb-6">
          {liens.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/centre' || l.to === '/mairie' || l.to === '/admin'}
              // Couleurs et espacements : variables --menu-* et classes .menu-* (index.css)
              className={({ isActive }) => `menu-lien flex w-full items-center gap-2 font-titre text-base font-bold ${isActive ? 'menu-lien-actif' : ''}`}>
              <l.icone className="h-5 w-5 shrink-0" aria-hidden />
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Contenu decale de la largeur de la barre laterale : il ne passe jamais dessous */}
      <div className="flex min-h-screen flex-col md:pl-60">
      <header className="bg-primary-700 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={boutonMenu} type="button" className="-ml-1 rounded-md p-1.5 hover:bg-primary-800 md:hidden" onClick={() => setMenuOuvert(true)}
              aria-label="Ouvrir le menu" aria-expanded={menuOuvert} aria-controls="menu-principal">
              <Menu className="h-6 w-6" aria-hidden />
            </button>
            {/* Drapeau national, a gauche du titre ; liseré blanc pour detacher la bande verte du fond vert */}
            <DrapeauCameroun className="h-7 w-auto shrink-0 rounded-sm ring-1 ring-white/80 sm:h-8" />
            <div className="min-w-0">
              {/* +4 points par rapport a l'origine : 9 pt -> 13 pt (mobile), 10,5 pt -> 14,5 pt (640 px et plus) */}
              <div className="font-titre text-[13pt] font-bold leading-tight tracking-wide sm:text-[14.5pt]">SYSTÈME NATIONAL DE DIGITALISATION DES ACTES DE NAISSANCE</div>
              {rattachement && <div className="truncate text-xs text-primary-100">{rattachement}</div>}
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
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto mt-auto w-full max-w-7xl px-4 py-6 text-center text-xs text-gray-400">
        République du Cameroun — Paix · Travail · Patrie · <a className="underline" href="/verifier" target="_blank" rel="noreferrer">Vérifier un acte</a>
      </footer>
      </div>
    </div>
  );
}
