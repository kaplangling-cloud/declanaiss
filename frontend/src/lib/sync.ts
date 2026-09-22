import { api, ApiError, estHorsLigne } from './api';
import { brouillons } from './db';
import type { BrouillonLocal, Declaration } from '../types';

type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
let enCours = false;
/**
 * Derniere version serveur acceptee pour chaque clientUuid pendant la session.
 * Le formulaire garde sa version de depart ; sans ce suivi, un troisieme
 * enregistrement du meme dossier etait renvoye avec une version perimee et
 * signale a tort comme un conflit.
 */
const etatsServeur = new Map<string, { id?: string; version: number }>();

export const sync = {
  abonner(cb: Ecouteur) { ecouteurs.add(cb); return () => { ecouteurs.delete(cb); }; },
  get enCours() { return enCours; },
  etatServeur(clientUuid: string) { return etatsServeur.get(clientUuid); },

  /** Enregistre localement puis tente une synchronisation immediate si en ligne. */
  async enregistrerLocal(b: Omit<BrouillonLocal, 'statutLocal' | 'modifieLe'> & Partial<BrouillonLocal>) {
    const connu = etatsServeur.get(b.clientUuid);
    const rebase = connu && connu.version > b.versionBase ? { versionBase: connu.version, serveurId: connu.id ?? b.serveurId } : {};
    const entree: BrouillonLocal = { ...b, ...rebase, statutLocal: 'A_SYNCHRONISER', modifieLe: new Date().toISOString() } as BrouillonLocal;
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
    // L'ecrasement est demande pour ce seul element : il ne doit pas s'etendre au reste de la file
    else { await brouillons.ecrire({ ...b, statutLocal: 'A_SYNCHRONISER', versionBase: b.serveur?.version ?? b.versionBase, forcer: true, serveur: undefined, message: undefined }); }
    notifier();
    if (choix === 'LOCAL') void sync.executer();
  },

  async executer() {
    if (enCours || estHorsLigne()) return;
    const file = await brouillons.aSynchroniser();
    if (!file.length) return;
    enCours = true; notifier();
    let relancer = false;
    try {
      const r = await api<{ resultats: ResultatSync[] }>('/declarations/sync', {
        method: 'POST',
        body: { elements: file.map((b) => ({ clientUuid: b.clientUuid, action: b.action, versionBase: b.versionBase, saisieLe: b.saisieLe, forcer: !!b.forcer, payload: b.payload })) },
      });
      for (const res of r.resultats) {
        const b = await brouillons.lire(res.clientUuid);
        if (!b) continue;
        switch (res.resultat) {
          case 'CREEE': case 'MISE_A_JOUR': {
            if (res.version !== undefined) etatsServeur.set(res.clientUuid, { id: res.id, version: res.version });
            const envoye = file.find((x) => x.clientUuid === res.clientUuid);
            if (envoye && b.modifieLe !== envoye.modifieLe) {
              // Saisie enregistree pendant l'envoi : la supprimer la perdrait. Elle reste
              // en file, rebasee sur la version que le serveur vient d'accepter.
              await brouillons.ecrire({ ...b, versionBase: res.version ?? b.versionBase, serveurId: res.id ?? b.serveurId, forcer: undefined });
              relancer = true;
            } else {
              // Accepte par le serveur : la copie locale n'a plus de raison d'exister
              await brouillons.supprimer(res.clientUuid);
            }
            break;
          }
          case 'INCHANGEE':
            // Le serveur n'a pas applique la saisie locale (dossier verrouille ou valide entre-temps).
            // La supprimer ici ferait perdre ce que l'agent a saisi sans qu'il le sache : elle reste
            // visible jusqu'a ce qu'il choisisse explicitement de conserver la version serveur.
            await brouillons.ecrire({ ...b, statutLocal: 'CONFLIT', serveurId: res.id, statutServeur: res.statut, message: res.message, forcer: undefined });
            break;
          case 'CONFLIT':
            await brouillons.ecrire({ ...b, statutLocal: 'CONFLIT', serveurId: res.id, serveur: res.serveur, statutServeur: res.statut, message: res.message, forcer: undefined });
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
    if (relancer) void sync.executer();
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
