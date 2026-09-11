import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Tuile } from '../components/ui';

interface Synthese {
  total: number; parStatut: { cle: string; total: number }[]; parModeAccouchement: { cle: string; total: number }[]; parTerme: { cle: string; total: number }[]; parSexe: { cle: string; total: number }[];
  parCentre: { centre?: { code: string; nom: string }; total: number; poidsMoyen: number | null }[]; parPeriode: { periode: string; total: number; voieBasse: number; cesarienne: number }[];
}

/** Statistiques : par centre, par periode, par mode d'accouchement + export CSV. */
export default function Stats() {
  const { aRole } = useAuth();
  const [f, setF] = useState({ du: '', au: '', centreId: '', granularite: 'mois' });
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const { data: s } = useQuery({ queryKey: ['stats', f], queryFn: () => api<Synthese>(`/stats?${qs}`) });
  const { data: centres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string }[]>('/centres'), enabled: !aRole('CHEF_CENTRE') });

  const exporter = async () => {
    const r = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/stats/export.csv?${qs}`, { headers: { Authorization: `Bearer ${tokens.access()}` } });
    const blob = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `statistiques-naissances.csv`; a.click();
  };
  const max = Math.max(1, ...(s?.parPeriode ?? []).map((p) => p.total));
  const lib: Record<string, string> = { VOIE_BASSE: 'Voie basse', CESARIENNE: 'Césarienne', A_TERME: 'À terme', PREMATURE: 'Prématuré', MASCULIN: 'Garçons', FEMININ: 'Filles', NON_RENSEIGNE: 'Non renseigné' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h1>Statistiques des naissances</h1><button className="btn-secondary" onClick={exporter}>Exporter CSV</button></div>
      <div className="card flex flex-wrap gap-3">
        <div><label>Du</label><input type="date" className="input" value={f.du} onChange={(e) => setF({ ...f, du: e.target.value })} /></div>
        <div><label>Au</label><input type="date" className="input" value={f.au} onChange={(e) => setF({ ...f, au: e.target.value })} /></div>
        {centres && <div><label>Centre</label><select className="input" value={f.centreId} onChange={(e) => setF({ ...f, centreId: e.target.value })}><option value="">Tous</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>}
        <div><label>Période</label><select className="input" value={f.granularite} onChange={(e) => setF({ ...f, granularite: e.target.value })}><option value="jour">Jour</option><option value="mois">Mois</option><option value="annee">Année</option></select></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile titre="Total" valeur={s?.total ?? 0} />
        {(s?.parModeAccouchement ?? []).map((m) => <Tuile key={m.cle} titre={lib[m.cle] ?? m.cle} valeur={m.total} sous={s?.total ? `${Math.round((m.total / s.total) * 100)} %` : undefined} />)}
        {(s?.parTerme ?? []).filter((t) => t.cle === 'PREMATURE').map((t) => <Tuile key={t.cle} titre="Prématurés" valeur={t.total} />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card"><h2 className="mb-3">Par période</h2>
          <div className="space-y-2">{(s?.parPeriode ?? []).map((p) => (
            <div key={p.periode} className="flex items-center gap-3 text-sm"><span className="w-20 font-mono text-xs">{p.periode}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded bg-gray-100"><div className="bg-primary-600" style={{ width: `${(p.voieBasse / max) * 100}%` }} title={`Voie basse : ${p.voieBasse}`} /><div className="bg-primary-300" style={{ width: `${(p.cesarienne / max) * 100}%` }} title={`Césarienne : ${p.cesarienne}`} /></div>
              <span className="w-8 text-right">{p.total}</span></div>))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-gray-500"><span><span className="inline-block h-3 w-3 rounded bg-primary-600 align-middle" /> Voie basse</span><span><span className="inline-block h-3 w-3 rounded bg-primary-300 align-middle" /> Césarienne</span></div>
        </div>
        <div className="card"><h2 className="mb-3">Par centre</h2>
          <table className="table"><thead><tr><th>Centre</th><th>Naissances</th><th>Poids moyen</th></tr></thead><tbody>{(s?.parCentre ?? []).map((c, i) => <tr key={i}><td>{c.centre?.nom ?? '—'}</td><td>{c.total}</td><td>{c.poidsMoyen ? `${c.poidsMoyen} g` : '—'}</td></tr>)}</tbody></table>
          <h2 className="mb-2 mt-4">Répartition</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">{[...(s?.parSexe ?? []), ...(s?.parStatut ?? [])].map((x, i) => <div key={i} className="flex justify-between rounded bg-gray-50 px-2 py-1"><span>{lib[x.cle] ?? x.cle}</span><span className="font-medium">{x.total}</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}
