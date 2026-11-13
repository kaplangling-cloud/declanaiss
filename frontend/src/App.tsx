import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import VerifierPublic from './pages/VerifierPublic';
import MotDePasseOublie from './pages/MotDePasseOublie';
import ReinitialiserMotDePasse from './pages/ReinitialiserMotDePasse';
import ChangerMotDePasse from './pages/ChangerMotDePasse';
import CentreDashboard from './pages/centre/Dashboard';
import DeclarationForm from './pages/centre/DeclarationForm';
import DeclarationDetail from './pages/DeclarationDetail';
import Personnel from './pages/centre/Personnel';
import FileSync from './pages/centre/FileSync';
import MairieDashboard from './pages/mairie/Dashboard';
import Actes from './pages/mairie/Actes';
import AdminDashboard from './pages/admin/Dashboard';
import Audit from './pages/admin/Audit';
import Stats from './pages/Stats';
import Centres from './pages/admin/Centres';
import Utilisateurs from './pages/admin/Utilisateurs';

function Accueil() {
  const { utilisateur } = useAuth();
  if (!utilisateur) return <Navigate to="/connexion" replace />;
  if (utilisateur.doitChangerMotDePasse) return <Navigate to="/mot-de-passe" replace />;
  switch (utilisateur.role) {
    case 'PERSONNEL_SANTE': case 'CHEF_CENTRE': return <Navigate to="/centre" replace />;
    case 'OFFICIER_ETAT_CIVIL': case 'SECRETAIRE_MAIRIE': return <Navigate to="/mairie" replace />;
    default: return <Navigate to="/admin" replace />;
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />
      <Route path="/reinitialiser" element={<ReinitialiserMotDePasse />} />
      <Route path="/verifier" element={<VerifierPublic />} />
      <Route path="/verifier/:reference" element={<VerifierPublic />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Accueil />} />
          <Route path="/mot-de-passe" element={<ChangerMotDePasse />} />
          <Route path="/declarations/:id" element={<DeclarationDetail />} />
          <Route path="/stats" element={<Stats />} />

          <Route element={<ProtectedRoute roles={['PERSONNEL_SANTE', 'CHEF_CENTRE']} />}>
            <Route path="/centre" element={<CentreDashboard />} />
            <Route path="/centre/nouvelle" element={<DeclarationForm />} />
            <Route path="/centre/brouillons/:clientUuid" element={<DeclarationForm />} />
            <Route path="/centre/declarations/:id/modifier" element={<DeclarationForm />} />
            <Route path="/centre/synchronisation" element={<FileSync />} />
            <Route path="/centre/personnel" element={<Personnel />} />
          </Route>

          <Route element={<ProtectedRoute roles={['OFFICIER_ETAT_CIVIL', 'SECRETAIRE_MAIRIE']} />}>
            <Route path="/mairie" element={<MairieDashboard />} />
            <Route path="/mairie/actes" element={<Actes />} />
          </Route>

          <Route element={<ProtectedRoute roles={['ADMIN_NATIONAL']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/audit" element={<Audit />} />
            <Route path="/admin/centres" element={<Centres />} />
            <Route path="/admin/utilisateurs" element={<Utilisateurs />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
