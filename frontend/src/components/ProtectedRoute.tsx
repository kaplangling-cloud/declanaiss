import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Role } from '../types';

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { utilisateur, chargement } = useAuth();
  const location = useLocation();
  if (chargement) return <div className="flex h-screen items-center justify-center text-primary-700">Chargement…</div>;
  if (!utilisateur) return <Navigate to="/connexion" state={{ from: location }} replace />;
  if (roles && !roles.includes(utilisateur.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
