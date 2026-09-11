import { useEffect, useState } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, estHorsLigne } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { brouillons, referentiels } from '../../lib/db';
import { sync } from '../../lib/sync';
import { declarationComplete, etapes } from '../../lib/validation';
import { Alerte, Champ } from '../../components/ui';
import type { Declaration, DeclarationPayload, PersonnelSante, TypePiece } from '../../types';

type Valeurs = DeclarationPayload;

const CHAMPS_PAR_ETAPE: Record<string, FieldPath<Valeurs>[]> = {
  enfant: ['enfantNom', 'enfantPrenoms', 'enfantSexe', 'enfantDateNaissance', 'enfantHeureNaissance', 'modeAccouchement', 'termeGrossesse', 'moisGrossesse', 'poidsNaissanceGrammes'],
  pere: ['pereNom', 'perePrenoms', 'pereProfession', 'pereDomicile', 'pereNationalite', 'pereDateNaissance', 'pereLieuNaissance', 'pereCniNumero', 'pereCniDateDelivrance'],
  mere: ['mereNom', 'merePrenoms', 'mereProfession', 'mereDomicile', 'mereNationalite', 'mereDateNaissance', 'mereLieuNaissance', 'mereCniNumero', 'mereCniDateDelivrance'],
  personnel: ['personnelAccoucheurId', 'declarantEstPersonnel', 'declarantNom', 'declarantPrenoms', 'declarantQualite', 'declarantContact'],
  pieces: [],
};

/**
 * Formulaire multi-etapes. Fonctionne integralement hors-ligne :
 * chaque enregistrement est ecrit dans IndexedDB puis pousse vers le
 * serveur des que le reseau est disponible (cf. lib/sync.ts).
 */
export default function DeclarationForm() {
  const { utilisateur } = useAuth();
  const navigate = useNavigate();
  const { clientUuid: uuidBrouillon, id: idServeur } = useParams();
  const [etape, setEtape] = useState(0);
  const [clientUuid, setClientUuid] = useState<string>(() => uuidBrouillon ?? crypto.randomUUID());
  const [versionBase, setVersionBase] = useState(0);
  const [serveurId, setServeurId] = useState<string | undefined>(idServeur);
  const [statutServeur, setStatutServeur] = useState<Declaration['statut'] | undefined>();
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur' | 'avert'; texte: string; details?: string[] } | null>(null);
  const [pret, setPret] = useState(!uuidBrouillon && !idServeur);
  const [saisieLe] = useState(() => new Date().toISOString());

  const form = useForm<Valeurs>({
    resolver: zodResolver(declarationComplete as any),
    mode: 'onBlur',
    defaultValues: { declarantEstPersonnel: true, termeGrossesse: 'A_TERME' },
  });
  const { register, handleSubmit, trigger, getValues, reset, watch, formState: { errors } } = form;

  // Personnel habilite : reseau puis cache local (usage hors-ligne)
  const centreId = utilisateur?.centreId ?? '';
  const { data: personnel } = useQuery({
    queryKey: ['personnel', centreId],
    queryFn: async () => {
      try {
        const l = await api<PersonnelSante[]>(`/centres/${centreId}/personnel`);
        await referentiels.ecrire(referentiels.personnel(centreId), l);
        return l;
      } catch {
        return (await referentiels.lire<PersonnelSante[]>(referentiels.personnel(centreId))) ?? [];
      }
    },
    enabled: !!centreId,
  });

  // Chargement : brouillon local ou declaration serveur
  useEffect(() => {
    (async () => {
      if (uuidBrouillon) {
        const b = await brouillons.lire(uuidBrouillon);
        if (b) { reset({ declarantEstPersonnel: true, ...b.payload }); setVersionBase(b.versionBase); setServeurId(b.serveurId); }
      } else if (idServeur) {
        try {
          const d = await api<Declaration>(`/declarations/${idServeur}`);
          const { id, version, clientUuid: cu, statut, ...reste } = d;
          reset(nettoyer(reste));
          setClientUuid(cu); setVersionBase(version); setServeurId(id); setStatutServeur(statut);
        } catch (e) { setMessage({ type: 'erreur', texte: `Chargement impossible : ${(e as Error).message}` }); }
      }
      setPret(true);
    })();
  }, [uuidBrouillon, idServeur, reset]);

  const termeGrossesse = watch('termeGrossesse');
  const declarantEstPersonnel = watch('declarantEstPersonnel');

  const enregistrerBrouillon = async () => {
    const payload = nettoyer(getValues());
    await sync.enregistrerLocal({ clientUuid, serveurId, versionBase, payload, action: 'ENREGISTRER', saisieLe });
    setMessage({ type: 'succes', texte: estHorsLigne() ? 'Brouillon enregistré sur ce poste. Il sera synchronisé au retour du réseau.' : 'Brouillon enregistré et en cours de synchronisation.' });
  };

  const suivant = async () => {
    const ok = await trigger(CHAMPS_PAR_ETAPE[etapes[etape].id]);
    if (ok) { setEtape((e) => Math.min(e + 1, etapes.length - 1)); setMessage(null); }
  };

  const soumettre = handleSubmit(async (valeurs) => {
    const payload = nettoyer(valeurs);
    await sync.enregistrerLocal({ clientUuid, serveurId, versionBase, payload, action: 'SOUMETTRE', saisieLe });
    setMessage({ type: 'succes', texte: estHorsLigne() ? 'Déclaration mise en file : elle sera soumise à la mairie dès le retour du réseau.' : 'Déclaration transmise. Synchronisation en cours…' });
    setTimeout(() => navigate('/centre'), 1200);
  }, (errs) => {
    const details = Object.values(errs).map((e: any) => e?.message).filter(Boolean) as string[];
    setMessage({ type: 'erreur', texte: 'La déclaration est incomplète ou incohérente.', details });
  });

  const err = (n: keyof Valeurs) => (errors as any)[n]?.message as string | undefined;
  const cls = (n: keyof Valeurs) => `input ${err(n) ? 'input-error' : ''}`;
  const verrouillee = statutServeur && !['BROUILLON', 'REJETEE', 'SOUMISE'].includes(statutServeur);

  if (!pret) return <p>Chargement…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1>{serveurId ? 'Modifier la déclaration' : 'Nouvelle déclaration de naissance'}</h1>
        <span className="text-xs text-gray-400 font-mono">{clientUuid.slice(0, 8)}</span>
      </div>

      {verrouillee && <div className="mb-4"><Alerte type="avert">Cette déclaration est {statutServeur?.toLowerCase()} : elle n'est plus modifiable par le centre.</Alerte></div>}

      {/* Fil d'ariane des etapes */}
      <ol className="mb-6 flex flex-wrap gap-2">
        {etapes.map((e, i) => (
          <li key={e.id}>
            <button type="button" onClick={() => i < etape && setEtape(i)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${i === etape ? 'bg-primary-600 text-white' : i < etape ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-500'}`}>
              {i + 1}. {e.titre}
            </button>
          </li>
        ))}
      </ol>

      {message && (
        <div className="mb-4">
          <Alerte type={message.type}>
            {message.texte}
            {message.details && <ul className="mt-2 list-disc pl-5">{message.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
          </Alerte>
        </div>
      )}

      <form onSubmit={soumettre} className="card space-y-5" noValidate>
        <fieldset disabled={!!verrouillee} className="space-y-5">
        {etape === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Nom" obligatoire erreur={err('enfantNom')}><input className={cls('enfantNom')} {...register('enfantNom')} autoFocus /></Champ>
            <Champ label="Prénom(s)" obligatoire erreur={err('enfantPrenoms')}><input className={cls('enfantPrenoms')} {...register('enfantPrenoms')} /></Champ>
            <Champ label="Sexe" obligatoire erreur={err('enfantSexe')}>
              <select className={cls('enfantSexe')} {...register('enfantSexe')}><option value="">—</option><option value="MASCULIN">Masculin</option><option value="FEMININ">Féminin</option></select>
            </Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Date de naissance" obligatoire erreur={err('enfantDateNaissance')}><input type="date" max={new Date().toISOString().slice(0, 10)} className={cls('enfantDateNaissance')} {...register('enfantDateNaissance')} /></Champ>
              <Champ label="Heure" obligatoire erreur={err('enfantHeureNaissance')}><input type="time" className={cls('enfantHeureNaissance')} {...register('enfantHeureNaissance')} /></Champ>
            </div>
            <Champ label="Lieu de naissance"><input className="input" value={utilisateur?.centre?.nom ?? ''} disabled /></Champ>
            <Champ label="Mode d'accouchement" obligatoire erreur={err('modeAccouchement')}>
              <select className={cls('modeAccouchement')} {...register('modeAccouchement')}><option value="">—</option><option value="VOIE_BASSE">Voie basse</option><option value="CESARIENNE">Césarienne</option></select>
            </Champ>
            <Champ label="Terme" obligatoire erreur={err('termeGrossesse')}>
              <select className={cls('termeGrossesse')} {...register('termeGrossesse')}><option value="A_TERME">À terme</option><option value="PREMATURE">Prématuré</option></select>
            </Champ>
            {termeGrossesse === 'PREMATURE' && (
              <Champ label="Mois de grossesse" obligatoire erreur={err('moisGrossesse')}><input type="number" min={4} max={8} className={cls('moisGrossesse')} {...register('moisGrossesse')} /></Champ>
            )}
            <Champ label="Poids de naissance (g)" obligatoire erreur={err('poidsNaissanceGrammes')} aide="Donnée de santé, chiffrée au repos"><input type="number" min={300} max={8000} step={10} className={cls('poidsNaissanceGrammes')} {...register('poidsNaissanceGrammes')} /></Champ>
          </div>
        )}

        {(etape === 1 || etape === 2) && (() => {
          const p = etape === 1 ? 'pere' : 'mere';
          const f = (s: string) => `${p}${s}` as keyof Valeurs;
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              <Champ label="Nom" obligatoire erreur={err(f('Nom'))}><input className={cls(f('Nom'))} {...register(f('Nom'))} autoFocus /></Champ>
              <Champ label="Prénom(s)" obligatoire erreur={err(f('Prenoms'))}><input className={cls(f('Prenoms'))} {...register(f('Prenoms'))} /></Champ>
              <Champ label="Date de naissance" obligatoire erreur={err(f('DateNaissance'))}><input type="date" className={cls(f('DateNaissance'))} {...register(f('DateNaissance'))} /></Champ>
              <Champ label="Lieu de naissance" obligatoire erreur={err(f('LieuNaissance'))}><input className={cls(f('LieuNaissance'))} {...register(f('LieuNaissance'))} /></Champ>
              <Champ label="Profession" obligatoire erreur={err(f('Profession'))}><input className={cls(f('Profession'))} {...register(f('Profession'))} /></Champ>
              <Champ label="Nationalité" obligatoire erreur={err(f('Nationalite'))}><input className={cls(f('Nationalite'))} defaultValue="Camerounaise" {...register(f('Nationalite'))} /></Champ>
              <div className="sm:col-span-2"><Champ label="Domicile" obligatoire erreur={err(f('Domicile'))}><input className={cls(f('Domicile'))} {...register(f('Domicile'))} /></Champ></div>
              <Champ label="Numéro de CNI" obligatoire erreur={err(f('CniNumero'))} aide="Chiffré au repos"><input className={`${cls(f('CniNumero'))} font-mono`} {...register(f('CniNumero'))} /></Champ>
              <Champ label="Date de délivrance de la CNI" obligatoire erreur={err(f('CniDateDelivrance'))}><input type="date" className={cls(f('CniDateDelivrance'))} {...register(f('CniDateDelivrance'))} /></Champ>
            </div>
          );
        })()}

        {etape === 3 && (
          <div className="space-y-4">
            <Champ label="Personnel ayant effectué l'accouchement" obligatoire erreur={err('personnelAccoucheurId')}>
              <select className={cls('personnelAccoucheurId')} {...register('personnelAccoucheurId')}>
                <option value="">—</option>
                {(personnel ?? []).filter((p) => p.habilite).map((p) => <option key={p.id} value={p.id}>{p.prenoms} {p.nom} — {p.fonction}{p.numeroOrdre ? ` (${p.numeroOrdre})` : ''}</option>)}
              </select>
            </Champ>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('declarantEstPersonnel')} /> Le déclarant est le personnel médical ci-dessus</label>
            {!declarantEstPersonnel && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ label="Nom du déclarant" obligatoire erreur={err('declarantNom')}><input className={cls('declarantNom')} {...register('declarantNom')} /></Champ>
                <Champ label="Prénom(s)" obligatoire erreur={err('declarantPrenoms')}><input className={cls('declarantPrenoms')} {...register('declarantPrenoms')} /></Champ>
                <Champ label="Qualité" obligatoire erreur={err('declarantQualite')} aide="Père, mère, témoin…"><input className={cls('declarantQualite')} {...register('declarantQualite')} /></Champ>
                <Champ label="Contact" erreur={err('declarantContact')}><input className={cls('declarantContact')} {...register('declarantContact')} /></Champ>
              </div>
            )}
          </div>
        )}

        {etape === 4 && <Recapitulatif valeurs={getValues()} personnel={personnel ?? []} serveurId={serveurId} />}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEtape((e) => Math.max(0, e - 1))} disabled={etape === 0}>← Précédent</button>
            {etape < etapes.length - 1 && <button type="button" className="btn-primary" onClick={suivant}>Suivant →</button>}
          </div>
          <div className="flex gap-2">
            {!verrouillee && <button type="button" className="btn-secondary" onClick={enregistrerBrouillon}>Enregistrer le brouillon</button>}
            {etape === etapes.length - 1 && !verrouillee && <button type="submit" className="btn-primary">Soumettre à la mairie</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

function Recapitulatif({ valeurs, personnel, serveurId }: { valeurs: Valeurs; personnel: PersonnelSante[]; serveurId?: string }) {
  const [type, setType] = useState<TypePiece>('CNI_PERE');
  const [fichier, setFichier] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const accoucheur = personnel.find((p) => p.id === valeurs.personnelAccoucheurId);

  const televerser = async () => {
    if (!fichier || !serveurId) return;
    const fd = new FormData(); fd.append('type', type); fd.append('fichier', fichier);
    try { await api(`/declarations/${serveurId}/pieces`, { method: 'POST', body: fd }); setMsg(`Pièce « ${fichier.name} » ajoutée.`); setFichier(null); }
    catch (e) { setMsg(`Échec : ${(e as Error).message}`); }
  };

  const L = ({ k, v }: { k: string; v?: string | number | null }) => <div className="flex justify-between gap-4 border-b border-gray-100 py-1"><span className="text-gray-500">{k}</span><span className="font-medium text-right">{v ?? '—'}</span></div>;
  return (
    <div className="space-y-5 text-sm">
      <div className="grid gap-6 md:grid-cols-2">
        <div><h2 className="mb-2">Enfant</h2>
          <L k="Nom" v={`${valeurs.enfantNom ?? ''} ${valeurs.enfantPrenoms ?? ''}`} /><L k="Sexe" v={valeurs.enfantSexe} /><L k="Né(e) le" v={`${valeurs.enfantDateNaissance ?? ''} à ${valeurs.enfantHeureNaissance ?? ''}`} />
          <L k="Accouchement" v={`${valeurs.modeAccouchement ?? ''} — ${valeurs.termeGrossesse ?? ''}${valeurs.moisGrossesse ? ` (${valeurs.moisGrossesse} mois)` : ''}`} /><L k="Poids" v={valeurs.poidsNaissanceGrammes ? `${valeurs.poidsNaissanceGrammes} g` : null} />
        </div>
        <div><h2 className="mb-2">Personnel & déclarant</h2>
          <L k="Accoucheur" v={accoucheur ? `${accoucheur.prenoms} ${accoucheur.nom}` : null} />
          <L k="Déclarant" v={valeurs.declarantEstPersonnel ? 'Le personnel médical' : `${valeurs.declarantPrenoms ?? ''} ${valeurs.declarantNom ?? ''} (${valeurs.declarantQualite ?? ''})`} />
        </div>
        {(['pere', 'mere'] as const).map((p) => (
          <div key={p}><h2 className="mb-2">{p === 'pere' ? 'Père' : 'Mère'}</h2>
            <L k="Nom" v={`${(valeurs as any)[`${p}Nom`] ?? ''} ${(valeurs as any)[`${p}Prenoms`] ?? ''}`} /><L k="Né(e) le" v={`${(valeurs as any)[`${p}DateNaissance`] ?? ''} à ${(valeurs as any)[`${p}LieuNaissance`] ?? ''}`} />
            <L k="Profession" v={(valeurs as any)[`${p}Profession`]} /><L k="Domicile" v={(valeurs as any)[`${p}Domicile`]} /><L k="Nationalité" v={(valeurs as any)[`${p}Nationalite`]} />
            <L k="CNI" v={`${(valeurs as any)[`${p}CniNumero`] ?? ''} du ${(valeurs as any)[`${p}CniDateDelivrance`] ?? ''}`} />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-primary-300 p-4">
        <h2 className="mb-2">Pièces jointes</h2>
        {serveurId && navigator.onLine ? (
          <div className="flex flex-wrap items-end gap-3">
            <div><label>Type</label><select className="input" value={type} onChange={(e) => setType(e.target.value as TypePiece)}><option value="CNI_PERE">CNI du père</option><option value="CNI_MERE">CNI de la mère</option><option value="ACTE_MARIAGE_PARENTS">Acte de mariage des parents</option><option value="AUTRE">Autre</option></select></div>
            <div><label>Fichier (JPEG, PNG, PDF)</label><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} /></div>
            <button type="button" className="btn-secondary" onClick={televerser} disabled={!fichier}>Téléverser</button>
            {msg && <p className="w-full text-xs text-gray-600">{msg}</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Les pièces (CNI des parents, acte de mariage) se joignent depuis la fiche de la déclaration une fois celle-ci synchronisée avec le serveur.</p>
        )}
      </div>
    </div>
  );
}

/** Retire les valeurs vides et les champs non transportables. */
function nettoyer(v: object): DeclarationPayload {
  const sortie: Record<string, unknown> = {};
  const autorises = new Set(Object.values(CHAMPS_PAR_ETAPE).flat() as string[]);
  autorises.add('donneesComplementaires');
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!autorises.has(k)) continue;
    if (val === '' || val === null || val === undefined || Number.isNaN(val)) continue;
    sortie[k] = typeof val === 'string' && /Date|date/.test(k) && val.length > 10 ? val.slice(0, 10) : val;
  }
  if (sortie.termeGrossesse !== 'PREMATURE') delete sortie.moisGrossesse;
  return sortie as DeclarationPayload;
}
