import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Baby, CircleCheck, Inbox, ScrollText } from 'lucide-react';
import { Tuile } from '../../components/ui';
import { BarresMois, RepartitionStatuts } from '../../components/Graphiques';
import type { Statut } from '../../types';

interface Synthese { total: number; parStatut: { cle: string; total: number }[]; parCentre: { centre?: { code: string; nom: string }; total: number; poidsMoyen: number | null }[]; parModeAccouchement: { cle: string; total: number }[] }

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: resume } = useQuery({
    queryKey: ['resume'],
    queryFn: () => api<{ parStatut: Record<Statut, number>; parMois: { mois: string; total: number }[] }>('/declarations/resume'),
  });
  const { data: s } = useQuery({ queryKey: ['stats-admin'], queryFn: () => api<Synthese>('/stats') });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string; actif: boolean; mairie: { nom: string }; _count: { declarations: number; personnels: number } }[]>('/centres') });
  const { data: integrite } = useQuery({ queryKey: ['audit-integrite'], queryFn: () => api<{ integre: boolean; total: number; ruptureSequence?: string }>('/audit/integrite') });
  const ps = resume?.parStatut ?? ({} as Record<Statut, number>);
  const cesar = s?.parModeAccouchement.find((m) => m.cle === 'CESARIENNE')?.total ?? 0;

  return (
    <div className="space-y-6">
      <h1>Supervision nationale</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile icone={Baby} titre="Naissances déclarées" valeur={s?.total ?? 0} onClick={() => navigate('/stats')} sous={s ? `${cesar} césarienne(s) — ${s.total ? Math.round((cesar / s.total) * 100) : 0} %` : undefined} />
        <Tuile icone={Inbox} titre="En attente mairie" valeur={(ps.SOUMISE ?? 0) + (ps.VERROUILLEE ?? 0)} />
        <Tuile icone={CircleCheck} titre="Validées" valeur={ps.VALIDEE ?? 0} />
        <Tuile icone={ScrollText} onClick={() => navigate('/admin/audit')} titre="Journal d'audit" valeur={integrite ? (integrite.integre ? '✔ intègre' : '✖ rupture') : '…'} sous={integrite ? `${integrite.total} entrées chaînées${integrite.ruptureSequence ? ` — rupture à #${integrite.ruptureSequence}` : ''}` : undefined} accent={integrite ? !integrite.integre : false} />
      </div>
      {resume && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2"><BarresMois donnees={resume.parMois} titre="Naissances déclarées par mois (national)" /></div>
          <RepartitionStatuts parStatut={resume.parStatut} />
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <div className="mb-2 flex items-center justify-between"><h2>Centres de santé</h2><Link to="/admin/centres" className="text-sm text-primary-700 underline">Gérer</Link></div>
          <table className="table"><thead><tr><th>Centre</th><th>Mairie</th><th>Personnel</th><th>Déclarations</th><th>Actif</th></tr></thead>
            <tbody>{(centres ?? []).map((c) => <tr key={c.id}><td>{c.nom}</td><td className="text-xs">{c.mairie.nom}</td><td>{c._count.personnels}</td><td>{c._count.declarations}</td><td>{c.actif ? 'Oui' : 'Non'}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <div className="mb-2 flex items-center justify-between"><h2>Naissances par centre</h2><Link to="/stats" className="text-sm text-primary-700 underline">Statistiques détaillées</Link></div>
          <table className="table"><thead><tr><th>Centre</th><th>Total</th><th>Poids moyen</th></tr></thead>
            <tbody>{(s?.parCentre ?? []).map((c, i) => <tr key={i}><td>{c.centre?.nom ?? '—'}</td><td>{c.total}</td><td>{c.poidsMoyen ? `${c.poidsMoyen} g` : '—'}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
