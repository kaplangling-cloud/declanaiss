import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, rafraichir, tokens } from './api';
import type { Role, Utilisateur } from '../types';

interface Ctx {
  utilisateur: Utilisateur | null;
  chargement: boolean;
  connecter: (email: string, motDePasse: string) => Promise<Utilisateur>;
  deconnecter: () => Promise<void>;
  aRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<Ctx | null>(null);
const CLE_UTILISATEUR = 'declanaiss.utilisateur';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(() => {
    try { return JSON.parse(localStorage.getItem(CLE_UTILISATEUR) || 'null'); } catch { return null; }
  });
  const [chargement, setChargement] = useState(true);

  // Au demarrage : restaure la session via le refresh token. Hors-ligne, on garde
  // l'utilisateur en cache pour permettre la saisie locale.
  useEffect(() => {
    (async () => {
      if (tokens.refresh()) {
        const ok = navigator.onLine ? await rafraichir() : true;
        if (ok && navigator.onLine) {
          try { const moi = await api<Utilisateur>('/auth/moi'); setUtilisateur((u) => ({ ...u, ...moi })); }
          catch { /* on garde le cache */ }
        } else if (!ok) { setUtilisateur(null); localStorage.removeItem(CLE_UTILISATEUR); }
      }
      setChargement(false);
    })();
    return tokens.onDeconnexion(() => { setUtilisateur(null); localStorage.removeItem(CLE_UTILISATEUR); });
  }, []);

  const connecter = useCallback(async (email: string, motDePasse: string) => {
    const r = await api<{ accessToken: string; refreshToken: string; utilisateur: Utilisateur }>('/auth/login', { method: 'POST', body: { email, motDePasse } });
    tokens.set(r.accessToken, r.refreshToken);
    setUtilisateur(r.utilisateur);
    localStorage.setItem(CLE_UTILISATEUR, JSON.stringify(r.utilisateur));
    return r.utilisateur;
  }, []);

  const deconnecter = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refresh() } }); } catch { /* ignore */ }
    tokens.clear(); setUtilisateur(null); localStorage.removeItem(CLE_UTILISATEUR);
  }, []);

  const value = useMemo<Ctx>(() => ({
    utilisateur, chargement, connecter, deconnecter,
    aRole: (...roles) => !!utilisateur && roles.includes(utilisateur.role),
  }), [utilisateur, chargement, connecter, deconnecter]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}

export const LIBELLE_ROLE: Record<Role, string> = {
  PERSONNEL_SANTE: 'Personnel de santé',
  CHEF_CENTRE: 'Chef de centre',
  OFFICIER_ETAT_CIVIL: "Officier d'état civil",
  SECRETAIRE_MAIRIE: 'Secrétaire de mairie',
  ADMIN_NATIONAL: 'Administrateur national',
};
