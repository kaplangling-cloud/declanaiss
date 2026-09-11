import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Resultat { statut: 'AUTHENTIQUE' | 'INTROUVABLE'; type?: 'ACTE' | 'DECLARATION'; annee?: number; verifieLe: string }

/**
 * Page publique : scan du QR (arrive avec /verifier/:reference) ou saisie
 * manuelle du numero. Aucune donnee personnelle n'est affichee.
 */
export default function VerifierPublic() {
  const { reference: refUrl } = useParams();
  const [reference, setReference] = useState(refUrl ?? '');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const verifier = async (ref: string) => {
    if (!ref.trim()) return;
    setEnCours(true); setErreur(null); setResultat(null);
    try { setResultat(await api<Resultat>(`/verification/${encodeURIComponent(ref.trim())}`)); }
    catch (e) { setErreur((e as Error).message); }
    finally { setEnCours(false); }
  };

  useEffect(() => { if (refUrl) void verifier(refUrl); }, [refUrl]);

  const soumettre = (e: FormEvent) => { e.preventDefault(); void verifier(reference); };

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-50 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-3 h-20 w-20 object-contain" />
          <h1>Vérification d'authenticité</h1>
          <p className="text-sm text-gray-500">Acte de naissance ou déclaration de naissance</p>
        </div>
        <form onSubmit={soumettre} className="card space-y-4">
          <div>
            <label>Numéro d'acte, numéro de déclaration ou code du QR</label>
            <input className="input font-mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EBO1/2026/00012 ou SU-HREBO-2026-000123-K7" />
            <p className="mt-1 text-xs text-gray-500">Scannez le QR code imprimé sur l'acte ou saisissez le numéro figurant sur le document.</p>
          </div>
          <button className="btn-primary w-full" disabled={enCours}>{enCours ? 'Vérification…' : 'Vérifier'}</button>
          {erreur && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erreur}</div>}
          {resultat && (
            <div className={`rounded-lg border p-4 text-center ${resultat.statut === 'AUTHENTIQUE' ? 'border-primary-300 bg-primary-50' : 'border-red-300 bg-red-50'}`}>
              <div className={`text-2xl font-bold ${resultat.statut === 'AUTHENTIQUE' ? 'text-primary-700' : 'text-red-700'}`}>
                {resultat.statut === 'AUTHENTIQUE' ? '✔ Document authentique' : '✖ Document introuvable'}
              </div>
              {resultat.statut === 'AUTHENTIQUE' && (
                <div className="mt-1 text-sm text-gray-600">
                  {resultat.type === 'ACTE' ? 'Acte de naissance enregistré' : 'Déclaration enregistrée (acte non encore établi)'}{resultat.annee ? ` — registre ${resultat.annee}` : ''}
                </div>
              )}
              {resultat.statut === 'INTROUVABLE' && <div className="mt-1 text-sm text-gray-600">Aucun document ne correspond à cette référence. Vérifiez la saisie ou rapprochez-vous de la mairie.</div>}
              <div className="mt-2 text-xs text-gray-400">Vérifié le {new Date(resultat.verifieLe).toLocaleString('fr-FR')}</div>
            </div>
          )}
        </form>
        <p className="mt-4 text-center text-xs text-gray-500">Ce service ne divulgue aucune donnée personnelle : il indique seulement si le document est connu du registre.</p>
      </div>
    </div>
  );
}
