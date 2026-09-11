import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alerte, Modale, StatutBadge, fmtDate, fmtDateLongue } from '../components/ui';
import type { Declaration, TypePiece } from '../types';

const LIB_PIECE: Record<TypePiece, string> = { CNI_PERE: 'CNI du père', CNI_MERE: 'CNI de la mère', ACTE_MARIAGE_PARENTS: 'Acte de mariage des parents', AUTRE: 'Autre' };

/** Fiche d'une declaration : lecture pour tous, actions selon le role. */
export default function DeclarationDetail() {
  const { id } = useParams();
  const { aRole } = useAuth();
  const qc = useQueryClient();
  const [modale, setModale] = useState<'rejet' | 'acte' | 'rectif' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { data: d, isLoading } = useQuery({ queryKey: ['declaration', id], queryFn: () => api<Declaration>(`/declarations/${id}`) });

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ['declaration', id] }); setModale(null); setErreur(null); };
  const action = (chemin: string, body?: unknown) => useMutation({ mutationFn: () => api(chemin, { method: 'POST', body }), onSuccess: rafraichir, onError: (e) => setErreur((e as Error).message) });
  const valider = action(`/declarations/${id}/valider`);
  const soumettre = action(`/declarations/${id}/soumettre`);
  const rejeter = useMutation({ mutationFn: (motif: string) => api(`/declarations/${id}/rejeter`, { method: 'POST', body: { motif } }), onSuccess: rafraichir, onError: (e) => setErreur((e as Error).message) });
  const editerActe = useMutation({ mutationFn: (body: Record<string, string>) => api(`/actes/declaration/${id}`, { method: 'POST', body }), onSuccess: rafraichir, onError: (e) => setErreur((e as Error).message) });
  const demanderRectif = useMutation({ mutationFn: (body: unknown) => api(`/declarations/${id}/rectifications`, { method: 'POST', body }), onSuccess: rafraichir, onError: (e) => setErreur((e as Error).message) });
  const deciderRectif = useMutation({ mutationFn: ({ rid, approuver }: { rid: string; approuver: boolean }) => api(`/declarations/${id}/rectifications/${rid}/decision`, { method: 'POST', body: { approuver } }), onSuccess: rafraichir, onError: (e) => setErreur((e as Error).message) });

  const ouvrirPdf = async (acteId: string) => {
    const blob = await api<Blob>(`/actes/${acteId}/pdf`, { brut: true });
    window.open(URL.createObjectURL(blob), '_blank');
  };
  const ouvrirPiece = async (pid: string) => {
    const blob = await api<Blob>(`/declarations/${id}/pieces/${pid}`, { brut: true });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  if (isLoading || !d) return <p>Chargement…</p>;
  const centre = aRole('PERSONNEL_SANTE', 'CHEF_CENTRE');
  const officier = aRole('OFFICIER_ETAT_CIVIL');
  const modifiable = centre && (d.statut === 'BROUILLON' || d.statut === 'REJETEE' || (d.statut === 'SOUMISE' && !!d.dateLimiteModification && new Date(d.dateLimiteModification) > new Date()));

  const L = ({ k, v }: { k: string; v?: string | number | null }) => <div className="flex justify-between gap-4 border-b border-gray-100 py-1 text-sm"><span className="text-gray-500">{k}</span><span className="text-right font-medium">{v ?? '—'}</span></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>{d.enfantNom} {d.enfantPrenoms}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <StatutBadge statut={d.statut} />
            <span className="font-mono text-xs">{d.numeroDeclaration ?? 'non numérotée'}</span>
            <span>· {d.centre?.nom}</span><span>→ {d.mairie?.nom}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {modifiable && <Link className="btn-secondary" to={`/centre/declarations/${d.id}/modifier`}>Modifier</Link>}
          {centre && (d.statut === 'BROUILLON' || d.statut === 'REJETEE') && <button className="btn-primary" onClick={() => soumettre.mutate()}>Soumettre à la mairie</button>}
          {officier && (d.statut === 'SOUMISE' || d.statut === 'VERROUILLEE') && <><button className="btn-danger" onClick={() => setModale('rejet')}>Renvoyer pour correction</button><button className="btn-primary" onClick={() => valider.mutate()}>Valider</button></>}
          {officier && d.statut === 'VALIDEE' && !d.acte && <button className="btn-primary" onClick={() => setModale('acte')}>Établir l'acte (PDF)</button>}
          {d.acte && <button className="btn-secondary" onClick={() => ouvrirPdf(d.acte!.id)}>Acte n° {d.acte.numeroActe} — PDF</button>}
          {(officier || aRole('ADMIN_NATIONAL')) && (d.statut === 'VERROUILLEE' || d.statut === 'VALIDEE') && <button className="btn-ghost" onClick={() => setModale('rectif')}>Rectification</button>}
        </div>
      </div>

      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      {d.statut === 'REJETEE' && <Alerte type="erreur"><strong>Motif du renvoi :</strong> {d.motifRejet}</Alerte>}
      {d.statut === 'SOUMISE' && d.dateLimiteModification && <Alerte type="info">Modifiable par le centre jusqu'au {fmtDate(d.dateLimiteModification, true)} ; verrouillage automatique ensuite.</Alerte>}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card"><h2 className="mb-2">Enfant</h2>
          <L k="Sexe" v={d.enfantSexe === 'MASCULIN' ? 'Masculin' : 'Féminin'} /><L k="Né(e) le" v={`${fmtDateLongue(d.enfantDateNaissance)} à ${d.enfantHeureNaissance}`} /><L k="Lieu" v={d.centre?.nom} />
          <L k="Accouchement" v={`${d.modeAccouchement === 'CESARIENNE' ? 'Césarienne' : 'Voie basse'} — ${d.termeGrossesse === 'PREMATURE' ? `prématuré (${d.moisGrossesse} mois)` : 'à terme'}`} />
          <L k="Poids" v={d.poidsNaissanceGrammes ? `${d.poidsNaissanceGrammes} g` : null} />
        </div>
        <div className="card"><h2 className="mb-2">Personnel & déclarant</h2>
          <L k="Accoucheur" v={d.accoucheur ? `${d.accoucheur.prenoms} ${d.accoucheur.nom} (${d.accoucheur.fonction})` : null} />
          <L k="Déclarant" v={d.declarantEstPersonnel ? 'Le personnel médical' : `${d.declarantPrenoms} ${d.declarantNom} — ${d.declarantQualite}`} />
          <L k="Créée par" v={d.creePar ? `${d.creePar.prenoms} ${d.creePar.nom}` : null} /><L k="Soumise le" v={fmtDate(d.dateSoumission, true)} /><L k="Validée le" v={fmtDate(d.dateValidation, true)} />
        </div>
        {(['pere', 'mere'] as const).map((p) => (
          <div key={p} className="card"><h2 className="mb-2">{p === 'pere' ? 'Père' : 'Mère'}</h2>
            <L k="Nom" v={`${(d as any)[`${p}Nom`] ?? ''} ${(d as any)[`${p}Prenoms`] ?? ''}`} /><L k="Né(e) le" v={`${fmtDateLongue((d as any)[`${p}DateNaissance`])} à ${(d as any)[`${p}LieuNaissance`] ?? ''}`} />
            <L k="Profession" v={(d as any)[`${p}Profession`]} /><L k="Domicile" v={(d as any)[`${p}Domicile`]} /><L k="Nationalité" v={(d as any)[`${p}Nationalite`]} />
            <L k="CNI" v={`${(d as any)[`${p}CniNumero`] ?? '—'} du ${fmtDate((d as any)[`${p}CniDateDelivrance`])}`} />
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-2">Pièces jointes</h2>
        {d.piecesJointes?.length ? (
          <ul className="divide-y text-sm">{d.piecesJointes.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2"><span>{LIB_PIECE[p.type]} — {p.nomOriginal} <span className="text-xs text-gray-400">({Math.round(p.tailleOctets / 1024)} Ko)</span></span><button className="text-primary-700 underline" onClick={() => ouvrirPiece(p.id)}>Ouvrir</button></li>))}</ul>
        ) : <p className="text-sm text-gray-500">Aucune pièce jointe.</p>}
        {modifiable && <AjoutPiece id={d.id} onAjout={rafraichir} />}
      </div>

      {d.rectifications && d.rectifications.length > 0 && (
        <div className="card"><h2 className="mb-2">Rectifications</h2>
          <ul className="divide-y text-sm">{d.rectifications.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center justify-between"><span><span className="badge bg-gray-100 text-gray-700 mr-2">{r.statut}</span>{r.motif}</span><span className="text-xs text-gray-500">{fmtDate(r.createdAt, true)}</span></div>
              <div className="mt-1 text-xs text-gray-600">Champs : {r.champsCibles.join(', ')}{r.referenceLegale && ` · Réf. : ${r.referenceLegale}`}{r.demandePar && ` · demandée par ${r.demandePar.prenoms} ${r.demandePar.nom}`}</div>
              {r.statut === 'DEMANDEE' && (officier || aRole('ADMIN_NATIONAL')) && (
                <div className="mt-2 flex gap-2"><button className="btn-primary text-xs" onClick={() => deciderRectif.mutate({ rid: r.id, approuver: true })}>Approuver et appliquer</button><button className="btn-danger text-xs" onClick={() => deciderRectif.mutate({ rid: r.id, approuver: false })}>Refuser</button></div>
              )}
            </li>))}</ul>
        </div>
      )}

      {modale === 'rejet' && (
        <Modale titre="Renvoyer pour correction" onFermer={() => setModale(null)}>
          <form onSubmit={(e) => { e.preventDefault(); rejeter.mutate(new FormData(e.currentTarget).get('motif') as string); }} className="space-y-3">
            <div><label>Motif (transmis au centre)</label><textarea name="motif" className="input" rows={4} required /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModale(null)}>Annuler</button><button className="btn-danger">Renvoyer</button></div>
          </form>
        </Modale>
      )}
      {modale === 'acte' && (
        <Modale titre="Établir l'acte de naissance" onFermer={() => setModale(null)}>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); editerActe.mutate(Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => v !== '')) as Record<string, string>); }} className="space-y-3">
            <Alerte type="info">Le numéro d'acte est attribué automatiquement dans le registre {new Date().getFullYear()} de votre mairie. Le PDF comporte un QR code et un code-barres d'authentification.</Alerte>
            <div><label>Date de dressage</label><input type="date" name="dateDressage" className="input" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div><label>Secrétaire d'état civil (assistant)</label><input name="secretaireNomComplet" className="input" /></div>
            <div><label>Mention marginale (optionnel)</label><input name="mentionMarginale" className="input" /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModale(null)}>Annuler</button><button className="btn-primary" disabled={editerActe.isPending}>{editerActe.isPending ? 'Génération…' : 'Établir et générer le PDF'}</button></div>
          </form>
        </Modale>
      )}
      {modale === 'rectif' && (
        <Modale titre="Demande de rectification" onFermer={() => setModale(null)}>
          <form onSubmit={(e) => {
            e.preventDefault(); const fd = new FormData(e.currentTarget);
            const champ = fd.get('champ') as string; const valeur = fd.get('valeur') as string;
            demanderRectif.mutate({ motif: fd.get('motif'), referenceLegale: fd.get('referenceLegale') || undefined, champsCibles: [champ], valeursApres: { [champ]: valeur } });
          }} className="space-y-3">
            <Alerte type="avert">Seule voie de modification après verrouillage. Chaque rectification est tracée dans le journal d'audit avec les valeurs avant/après.</Alerte>
            <div><label>Champ à rectifier</label>
              <select name="champ" className="input" required>{['enfantNom', 'enfantPrenoms', 'enfantSexe', 'enfantDateNaissance', 'enfantHeureNaissance', 'pereNom', 'perePrenoms', 'pereProfession', 'pereDomicile', 'pereNationalite', 'pereDateNaissance', 'pereLieuNaissance', 'mereNom', 'merePrenoms', 'mereProfession', 'mereDomicile', 'mereNationalite', 'mereDateNaissance', 'mereLieuNaissance'].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label>Nouvelle valeur</label><input name="valeur" className="input" required /></div>
            <div><label>Motif</label><textarea name="motif" className="input" rows={3} required /></div>
            <div><label>Référence légale (jugement, requête…)</label><input name="referenceLegale" className="input" /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModale(null)}>Annuler</button><button className="btn-primary">Enregistrer la demande</button></div>
          </form>
        </Modale>
      )}
    </div>
  );
}

function AjoutPiece({ id, onAjout }: { id: string; onAjout: () => void }) {
  const [type, setType] = useState<TypePiece>('CNI_PERE');
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const envoyer = async () => {
    if (!fichier) return;
    const fd = new FormData(); fd.append('type', type); fd.append('fichier', fichier);
    try { await api(`/declarations/${id}/pieces`, { method: 'POST', body: fd }); setFichier(null); onAjout(); } catch (e) { setErreur((e as Error).message); }
  };
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
      <div><label>Type</label><select className="input" value={type} onChange={(e) => setType(e.target.value as TypePiece)}>{Object.entries(LIB_PIECE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label>Fichier</label><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} /></div>
      <button className="btn-secondary" onClick={envoyer} disabled={!fichier}>Ajouter</button>
      {erreur && <p className="w-full text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
