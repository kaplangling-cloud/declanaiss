import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { Download, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alerte, LIBELLE_STATUT } from '../components/ui';
import { FournisseurInfobulle } from '../components/rapport/Infobulle';
import { Visuel } from '../components/rapport/Visuel';
import { libellePeriode, nombreFr, pourcent } from '../components/rapport/outils';
import { HistogrammeEmpile, TableauPeriodes, type PointPeriode } from '../components/rapport/HistogrammeEmpile';
import { Anneau, TableauParts, type Part } from '../components/rapport/Anneau';
import { BarresCentres, MatriceCentres, type LigneCentre } from '../components/rapport/Centres';
import { COULEUR_STATUT, ORDRE_STATUTS } from '../components/rapport/palette';
import type { Statut } from '../types';

interface Synthese {
  total: number; poidsMoyen: number | null;
  parStatut: { cle: string; total: number }[]; parModeAccouchement: { cle: string; total: number }[];
  parTerme: { cle: string; total: number }[]; parSexe: { cle: string; total: number }[];
  parCentre: LigneCentre[]; parPeriode: PointPeriode[];
}

type Preselection = '12m' | 'annee' | 'mois' | 'tout' | 'perso';
const PRESELECTIONS: { cle: Exclude<Preselection, 'perso'>; libelle: string }[] = [
  { cle: '12m', libelle: '12 derniers mois' }, { cle: 'annee', libelle: 'Année en cours' },
  { cle: 'mois', libelle: 'Mois en cours' }, { cle: 'tout', libelle: 'Tout' },
];
const jour = (d: Date) => format(d, 'yyyy-MM-dd');
function bornes(p: Preselection): { du: string; au: string } {
  const auj = new Date();
  if (p === '12m') return { du: jour(startOfMonth(subMonths(auj, 11))), au: jour(auj) };
  if (p === 'annee') return { du: jour(startOfYear(auj)), au: jour(auj) };
  if (p === 'mois') return { du: jour(startOfMonth(auj)), au: jour(auj) };
  return { du: '', au: '' };
}
/** Bornes d'une periode du graphique (« 2026-09 », « 2026-09-12 », « 2026 »), pour le filtrage croise. */
function bornesPeriode(p: string): { du: string; au: string } {
  if (p.length === 4) { const d = new Date(Number(p), 0, 1); return { du: jour(d), au: jour(endOfYear(d)) }; }
  if (p.length === 7) { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1); return { du: jour(d), au: jour(endOfMonth(d)) }; }
  return { du: p, au: p };
}

/**
 * Rapport statistique a la maniere de Power BI : segments (filtres) en tete,
 * cartes d'indicateurs, visuels avec infobulles et filtrage croise (un clic sur
 * une periode ou un centre filtre tout le rapport), vue tableau pour chaque visuel.
 * Tous les visuels lisent la meme synthese : leurs chiffres concordent toujours.
 */
export default function Stats() {
  const { aRole } = useAuth();
  const [preselection, setPreselection] = useState<Preselection>('12m');
  const [periodeChoisie, setPeriodeChoisie] = useState<string | null>(null);
  const [f, setF] = useState({ ...bornes('12m'), centreId: '', mairieId: '', granularite: 'mois' });
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  // Pendant un rechargement, le rapport garde l'affichage precedent (attenue), sans saut de mise en page
  const { data: s, isFetching, isPlaceholderData } = useQuery({ queryKey: ['stats', f], queryFn: () => api<Synthese>(`/stats?${qs}`), placeholderData: keepPreviousData });
  const voitCentres = !aRole('CHEF_CENTRE');
  const { data: tousCentres } = useQuery({ queryKey: ['centres'], queryFn: () => api<{ id: string; nom: string; mairieId: string }[]>('/centres'), enabled: voitCentres });
  // Une mairie choisie restreint la liste des centres : un centre d'une autre mairie donnait un rapport vide
  const centres = tousCentres && (f.mairieId ? tousCentres.filter((c) => c.mairieId === f.mairieId) : tousCentres);
  const { data: mairies } = useQuery({ queryKey: ['mairies'], queryFn: () => api<{ id: string; nom: string }[]>('/mairies'), enabled: aRole('ADMIN_NATIONAL') });

  const choisirPreselection = (p: Exclude<Preselection, 'perso'>) => { setPreselection(p); setPeriodeChoisie(null); setF((x) => ({ ...x, ...bornes(p) })); };
  const choisirPeriode = (p: string) => { setPreselection('perso'); setPeriodeChoisie(p); setF((x) => ({ ...x, ...bornesPeriode(p) })); };
  const reinitialiser = () => { setPreselection('12m'); setPeriodeChoisie(null); setF({ ...bornes('12m'), centreId: '', mairieId: '', granularite: 'mois' }); };

  const [erreurExport, setErreurExport] = useState<string | null>(null);
  const exporter = async () => {
    setErreurExport(null);
    try {
      const blob = await api<Blob>(`/stats/export.csv?${qs}`, { brut: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'statistiques-naissances.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setErreurExport(`Export impossible : ${(e as Error).message}`); }
  };

  const compte = (liste: { cle: string; total: number }[] | undefined, cle: string) => liste?.find((x) => x.cle === cle)?.total ?? 0;
  const total = s?.total ?? 0;
  const cesariennes = compte(s?.parModeAccouchement, 'CESARIENNE');
  const prematures = compte(s?.parTerme, 'PREMATURE');
  const filles = compte(s?.parSexe, 'FEMININ');
  const garcons = compte(s?.parSexe, 'MASCULIN');
  // Statuts dans l'ordre valide pour les daltonismes (le brouillon n'entre pas dans les statistiques)
  const partsStatut: Part[] = ORDRE_STATUTS.filter((st) => st !== 'BROUILLON').map((st) => ({
    cle: st, libelle: LIBELLE_STATUT[st as Statut], valeur: compte(s?.parStatut, st), couleur: COULEUR_STATUT[st as Statut],
  }));
  const nomCentre = centres?.find((c) => c.id === f.centreId)?.nom;
  const filtresCroises = [
    periodeChoisie && { cle: 'periode', libelle: `Période : ${libellePeriode(periodeChoisie)}`, retirer: () => choisirPreselection('12m') },
    f.centreId && { cle: 'centre', libelle: `Centre : ${nomCentre ?? 'sélectionné'}`, retirer: () => setF((x) => ({ ...x, centreId: '' })) },
  ].filter(Boolean) as { cle: string; libelle: string; retirer: () => void }[];

  return (
    <FournisseurInfobulle>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1>Statistiques des naissances</h1>
          <button className="btn-secondary" onClick={exporter}><Download className="h-4 w-4" aria-hidden /> Exporter CSV</button>
        </div>
        {erreurExport && <Alerte type="erreur">{erreurExport}</Alerte>}

        {/* Segments : une seule ligne, au-dessus de tout ce qu'ils filtrent */}
        <div className="card flex flex-wrap items-end gap-x-5 gap-y-3 py-4">
          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700" id="seg-periode">Période</span>
            <div className="flex flex-wrap gap-1" role="group" aria-labelledby="seg-periode">
              {PRESELECTIONS.map((p) => (
                <button key={p.cle} type="button" aria-pressed={preselection === p.cle} onClick={() => choisirPreselection(p.cle)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${preselection === p.cle ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>{p.libelle}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div><label htmlFor="du">Du</label><input id="du" type="date" className="input" value={f.du} onChange={(e) => { setPreselection('perso'); setPeriodeChoisie(null); setF({ ...f, du: e.target.value }); }} /></div>
            <div><label htmlFor="au">Au</label><input id="au" type="date" className="input" value={f.au} onChange={(e) => { setPreselection('perso'); setPeriodeChoisie(null); setF({ ...f, au: e.target.value }); }} /></div>
          </div>
          {mairies && (
            <div><label htmlFor="mairie">Mairie</label><select id="mairie" className="input" value={f.mairieId} onChange={(e) => setF({ ...f, mairieId: e.target.value, centreId: '' })}><option value="">Toutes</option>{mairies.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div>
          )}
          {centres && (
            <div><label htmlFor="centre">Centre</label><select id="centre" className="input" value={f.centreId} onChange={(e) => setF({ ...f, centreId: e.target.value })}><option value="">Tous</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
          )}
          <div><label htmlFor="gran">Regrouper par</label><select id="gran" className="input" value={f.granularite} onChange={(e) => setF({ ...f, granularite: e.target.value })}><option value="jour">Jour</option><option value="mois">Mois</option><option value="annee">Année</option></select></div>
        </div>

        {filtresCroises.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">Filtres appliqués :</span>
            {filtresCroises.map((c) => (
              <button key={c.cle} type="button" onClick={c.retirer} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-800 hover:bg-blue-100" title="Retirer ce filtre">
                {c.libelle} <X className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">retirer</span>
              </button>
            ))}
            <button type="button" className="text-blue-700 underline" onClick={reinitialiser}>Tout réinitialiser</button>
          </div>
        )}

        <div className={`space-y-5 transition-opacity ${isFetching && isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={isFetching}>
          {/* Cartes d'indicateurs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <CarteKpi libelle="Naissances" valeur={nombreFr(total)} principale />
            <CarteKpi libelle="Taux de césarienne" valeur={pourcent(cesariennes, total)} detail={`${nombreFr(cesariennes)} césarienne(s)`} />
            <CarteKpi libelle="Prématurés" valeur={pourcent(prematures, total)} detail={`${nombreFr(prematures)} naissance(s)`} />
            <CarteKpi libelle="Poids moyen" valeur={s?.poidsMoyen ? `${nombreFr(s.poidsMoyen)} g` : '—'} />
            <CarteKpi libelle="Filles / garçons" valeur={`${nombreFr(filles)} / ${nombreFr(garcons)}`} detail={total ? `${pourcent(filles, total)} de filles` : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Visuel className="lg:col-span-2" titre="Naissances par période" sousTitre="Par mode d'accouchement — cliquez une colonne pour filtrer le rapport"
              tableau={<TableauPeriodes donnees={s?.parPeriode ?? []} />}>
              <HistogrammeEmpile donnees={s?.parPeriode ?? []} onChoisir={choisirPeriode} />
            </Visuel>
            <Visuel titre="Dossiers par statut" tableau={<TableauParts parts={partsStatut} intitule="Statut" />}>
              <Anneau parts={partsStatut} libelleTotal="dossiers" />
            </Visuel>
          </div>

          {/* Un chef de centre ne voit que son centre : un graphique a une seule barre n'apporterait rien */}
          <div className={`grid gap-5 ${voitCentres ? 'lg:grid-cols-2' : ''}`}>
            {voitCentres && <Visuel titre="Naissances par centre" sousTitre="Cliquez une barre pour filtrer le rapport sur ce centre"
              tableau={<MatriceCentres lignes={s?.parCentre ?? []} poidsMoyen={s?.poidsMoyen ?? null} />}>
              <BarresCentres lignes={s?.parCentre ?? []} actif={f.centreId || undefined}
                onChoisir={(id) => setF((x) => ({ ...x, centreId: x.centreId === id ? '' : id }))} />
            </Visuel>}
            <Visuel titre="Détail par centre" sousTitre="Naissances, part et poids moyen"
              tableau={<MatriceCentres lignes={s?.parCentre ?? []} poidsMoyen={s?.poidsMoyen ?? null} />}>
              <div className="table-defilante"><MatriceCentres lignes={s?.parCentre ?? []} poidsMoyen={s?.poidsMoyen ?? null} /></div>
            </Visuel>
          </div>
        </div>
      </div>
    </FournisseurInfobulle>
  );
}

/**
 * Carte d'indicateur (a la Power BI) : la valeur d'abord, le libelle dessous.
 * Chiffres proportionnels : les chiffres a chasse fixe sont reserves aux colonnes.
 */
function CarteKpi({ libelle, valeur, detail, principale }: { libelle: string; valeur: string; detail?: string; principale?: boolean }) {
  return (
    <div className={`card py-4 ${principale ? 'col-span-2 border-blue-200 bg-blue-50 lg:col-span-1' : ''}`}>
      <div className={`font-semibold text-gray-900 ${principale ? 'text-4xl' : 'text-2xl'}`} style={{ fontVariantNumeric: 'proportional-nums' }}>{valeur}</div>
      <div className="mt-1 text-sm text-gray-600">{libelle}</div>
      {detail && <div className="mt-0.5 text-xs text-gray-500">{detail}</div>}
    </div>
  );
}
