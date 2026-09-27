import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fmtDate } from '../../components/ui';

interface Ligne { id: string; sequence: string; entite: string; entiteId: string; action: string; declarationId: string | null; acteurEmail: string | null; acteurRole: string | null; valeursAvant: unknown; valeursApres: unknown; metadonnees: unknown; ip: string | null; createdAt: string; hash: string }

/** Journal d'audit : qui a modifie quoi, quand. Lecture seule. */
export default function Audit() {
  const [f, setF] = useState({ entite: '', action: '', declarationId: '', du: '', au: '', page: 1 });
  const [ouvert, setOuvert] = useState<string | null>(null);
  const qs = Object.entries(f).filter(([, v]) => v !== '' && v !== 1).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const { data } = useQuery({ queryKey: ['audit', f], queryFn: () => api<{ total: number; page: number; taille: number; lignes: Ligne[] }>(`/audit?taille=50&page=${f.page}${qs ? `&${qs}` : ''}`) });
  const maj = (k: string, v: string) => setF((s) => ({ ...s, [k]: v, page: 1 }));

  return (
    <div className="space-y-4">
      <h1>Journal d'audit</h1>
      <div className="card flex flex-wrap gap-3">
        <select className="input w-auto" value={f.entite} onChange={(e) => maj('entite', e.target.value)}><option value="">Toute entité</option>{['Declaration', 'Acte', 'User', 'Centre', 'Mairie', 'PersonnelSante', 'PieceJointe', 'Rectification', 'Stats'].map((e) => <option key={e}>{e}</option>)}</select>
        <select className="input w-auto" value={f.action} onChange={(e) => maj('action', e.target.value)}><option value="">Toute action</option>{['CREATION', 'MODIFICATION', 'SOUMISSION', 'VALIDATION', 'REJET', 'VERROUILLAGE', 'RECTIFICATION', 'EDITION_ACTE', 'REIMPRESSION_ACTE', 'CONNEXION', 'ECHEC_CONNEXION', 'EXPORT', 'CREATION_COMPTE', 'DESACTIVATION_COMPTE'].map((a) => <option key={a}>{a}</option>)}</select>
        <input className="input w-72 font-mono text-xs" placeholder="ID de déclaration" value={f.declarationId} onChange={(e) => maj('declarationId', e.target.value)} />
        <input type="date" className="input w-auto" value={f.du} onChange={(e) => maj('du', e.target.value)} /><input type="date" className="input w-auto" value={f.au} onChange={(e) => maj('au', e.target.value)} />
        <span className="self-center text-sm text-gray-500">{data?.total ?? 0} entrée(s)</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="table"><thead><tr><th>#</th><th>Date</th><th>Acteur</th><th>Action</th><th>Entité</th><th>IP</th><th></th></tr></thead>
          <tbody>{(data?.lignes ?? []).map((l) => (
            <Fragment key={l.id}>
              <tr>
                <td className="font-mono text-xs">{l.sequence}</td><td className="text-xs">{fmtDate(l.createdAt, true)}</td><td className="text-xs">{l.acteurEmail ?? 'système'}<div className="text-gray-400">{l.acteurRole}</div></td>
                <td><span className="badge bg-primary-50 text-primary-800">{l.action}</span></td><td className="text-xs">{l.entite}<div className="font-mono text-gray-400">{l.entiteId.slice(0, 8)}</div></td><td className="text-xs">{l.ip ?? '—'}</td>
                <td className="text-right"><button className="text-primary-700 underline text-xs" onClick={() => setOuvert(ouvert === l.id ? null : l.id)}>{ouvert === l.id ? 'Masquer' : 'Détail'}</button></td>
              </tr>
              {ouvert === l.id && (
                <tr><td colSpan={7} className="bg-gray-50">
                  <div className="grid gap-3 text-xs md:grid-cols-3">
                    <div><div className="font-semibold">Avant</div><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(l.valeursAvant, null, 1) ?? '—'}</pre></div>
                    <div><div className="font-semibold">Après</div><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(l.valeursApres, null, 1) ?? '—'}</pre></div>
                    <div><div className="font-semibold">Métadonnées</div><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(l.metadonnees, null, 1) ?? '—'}</pre><div className="mt-2 font-mono text-gray-400">hash {l.hash.slice(0, 16)}…</div></div>
                  </div>
                </td></tr>
              )}
            </Fragment>))}</tbody></table>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-secondary" disabled={f.page <= 1} onClick={() => setF((s) => ({ ...s, page: s.page - 1 }))}>← Précédent</button>
          <button className="btn-secondary" disabled={!data || data.page * data.taille >= data.total} onClick={() => setF((s) => ({ ...s, page: s.page + 1 }))}>Suivant →</button>
        </div>
      </div>
    </div>
  );
}
