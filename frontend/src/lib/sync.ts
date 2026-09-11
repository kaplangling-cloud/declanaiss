import { api, ApiError, estHorsLigne } from './api';
import { brouillons } from './db';
import type { BrouillonLocal, Declaration } from '../types';

type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
let enCours = false;

export const sync = {
  abonner(cb: Ecouteur) { ecouteurs.add(cb); return () => { ecouteurs.delete(cb); }; },
  get enCours() { return enCours; },

  /** Enregistre localement puis tente une synchronisation immediate si en ligne. */
  async enregistrerLocal(b: Omit<BrouillonLocal, 'statutLocal' | 'modifieLe'> & Partial<BrouillonLocal>) {
    const entree: BrouillonLocal = { ...b, statutLocal: 'A_SYNCHRONISER', modifieLe: new Date().toISOString() } as BrouillonLocal;
    await brouillons.ecrire(entree);
    notifier();
    if (!estHorsLigne()) void sync.executer();
    return entree;
  },

  /** Resolution d'un conflit : garder la version serveur (abandon local) ou forcer la version locale. */
  async resoudre(clientUuid: string, choix: 'SERVEUR' | 'LOCAL') {
    const b = await brouillons.lire(clientUuid);
    if (!b) return;
    if (choix === 'SERVEUR') { await brouillons.supprimer(clientUuid); }
    else { await brouillons.ecrire({ ...b, statutLocal: 'A_SYNCHRONISER', versionBase: b.serveur?.version ?? b.versionBase, serveur: undefined, message: undefined }); }
    notifier();
    if (choix === 'LOCAL') void sync.executer(true);
  },

  async executer(forcer = false) {
    if (enCours || estHorsLigne()) return;
    const file = await brouillons.aSynchroniser();
    if (!file.length) return;
    enCours = true; notifier();
    try {
      const r = await api<{ resultats: ResultatSync[] }>('/declarations/sync', {
        method: 'POST',
        body: { elements: file.map((b) => ({ clientUuid: b.clientUuid, action: b.action, versionBase: b.versionBase, saisieLe: b.saisieLe, forcer, payload: b.payload })) },
      });
      for (const res of r.resultats) {
        const b = await brouillons.lire(res.clientUuid);
        if (!b) continue;
        switch (res.resultat) {
          case 'CREEE': case 'MISE_A_JOUR': case 'INCHANGEE':
            // Accepte par le serveur : la copie locale n'a plus de raison d'exister
            await brouillons.supprimer(res.clientUuid);
            break;
          case 'CONFLIT':
            await brouillons.ecrire({ ...b, statutLocal: 'CONFLIT', serveurId: res.id, serveur: res.serveur, statutServeur: res.statut, message: res.message });
            break;
          default:
            await brouillons.ecrire({ ...b, statutLocal: 'ERREUR', message: res.message, erreurs: res.erreurs });
        }
      }
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) { /* reseau ou serveur : on reessaiera */ }
      else for (const b of file) await brouillons.ecrire({ ...b, statutLocal: 'ERREUR', message: (e as Error).message });
    } finally {
      enCours = false; notifier();
    }
  },

  /** Retente les elements en erreur. */
  async retenter() {
    const tous = await brouillons.tous();
    for (const b of tous.filter((x) => x.statutLocal === 'ERREUR')) await brouillons.ecrire({ ...b, statutLocal: 'A_SYNCHRONISER', message: undefined, erreurs: undefined });
    notifier();
    await sync.executer();
  },
};

interface ResultatSync {
  clientUuid: string; resultat: 'CREEE' | 'MISE_A_JOUR' | 'CONFLIT' | 'INCHANGEE' | 'ERREUR';
  id?: string; version?: number; statut?: Declaration['statut']; numeroDeclaration?: string | null; message?: string; erreurs?: string[]; serveur?: Declaration;
}

function notifier() { ecouteurs.forEach((cb) => cb()); }

// Synchronisation automatique au retour du reseau
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void sync.executer());
  setInterval(() => void sync.executer(), 60_000);
}
