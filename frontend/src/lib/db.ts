import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { BrouillonLocal, PersonnelSante } from '../types';

/**
 * Base locale IndexedDB : brouillons saisis hors-ligne et referentiels.
 * Les donnees sont supprimees localement des qu'elles sont synchronisees et
 * acceptees par le serveur (pas de copie residuelle de donnees personnelles
 * sur le poste au-dela du necessaire).
 */
interface Schema extends DBSchema {
  brouillons: { key: string; value: BrouillonLocal; indexes: { 'par-statut': string; 'par-date': string } };
  referentiels: { key: string; value: { cle: string; valeur: unknown; majLe: string } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>('declanaiss', 1, {
      upgrade(d) {
        const b = d.createObjectStore('brouillons', { keyPath: 'clientUuid' });
        b.createIndex('par-statut', 'statutLocal');
        b.createIndex('par-date', 'modifieLe');
        d.createObjectStore('referentiels', { keyPath: 'cle' });
      },
    });
  }
  return dbPromise;
}

export const brouillons = {
  async tous(): Promise<BrouillonLocal[]> {
    const l = await (await db()).getAll('brouillons');
    return l.sort((a, b) => b.modifieLe.localeCompare(a.modifieLe));
  },
  async lire(clientUuid: string) { return (await db()).get('brouillons', clientUuid); },
  async ecrire(b: BrouillonLocal) { await (await db()).put('brouillons', b); },
  async supprimer(clientUuid: string) { await (await db()).delete('brouillons', clientUuid); },
  async aSynchroniser() { return (await db()).getAllFromIndex('brouillons', 'par-statut', 'A_SYNCHRONISER'); },
  async enConflit() { return (await db()).getAllFromIndex('brouillons', 'par-statut', 'CONFLIT'); },
  async compter() {
    const tous = await brouillons.tous();
    return {
      aSynchroniser: tous.filter((b) => b.statutLocal === 'A_SYNCHRONISER').length,
      conflits: tous.filter((b) => b.statutLocal === 'CONFLIT').length,
      erreurs: tous.filter((b) => b.statutLocal === 'ERREUR').length,
    };
  },
};

export const referentiels = {
  async lire<T>(cle: string): Promise<T | undefined> { return (await (await db()).get('referentiels', cle))?.valeur as T | undefined; },
  async ecrire(cle: string, valeur: unknown) { await (await db()).put('referentiels', { cle, valeur, majLe: new Date().toISOString() }); },
  personnel: (centreId: string) => `personnel:${centreId}` as const,
};

export type { PersonnelSante };
