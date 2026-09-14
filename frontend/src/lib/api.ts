/**
 * Client HTTP minimal : jeton d'acces en memoire, refresh token en
 * localStorage (rotation cote serveur), renouvellement transparent sur 401.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';
const CLE_REFRESH = 'declanaiss.refresh';

let accessToken: string | null = null;
let refreshEnCours: Promise<boolean> | null = null;
const ecouteursDeconnexion = new Set<() => void>();

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public erreurs?: string[], public body?: unknown) {
    super(message);
  }
}

export const tokens = {
  set(access: string, refresh: string) { accessToken = access; localStorage.setItem(CLE_REFRESH, refresh); },
  clear() { accessToken = null; localStorage.removeItem(CLE_REFRESH); },
  refresh: () => localStorage.getItem(CLE_REFRESH),
  access: () => accessToken,
  onDeconnexion(cb: () => void) { ecouteursDeconnexion.add(cb); return () => { ecouteursDeconnexion.delete(cb); }; },
};

export async function rafraichir(): Promise<boolean> {
  if (refreshEnCours) return refreshEnCours;
  // Le jeton est lu avant de creer la promesse partagee : un retour synchrone dans la
  // fonction asynchrone laissait refreshEnCours fige sur une promesse deja resolue a
  // false, et plus aucun renouvellement n'etait tente jusqu'au rechargement de la page.
  const rt = tokens.refresh();
  if (!rt) return false;
  refreshEnCours = (async () => {
    try {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (!r.ok) { tokens.clear(); ecouteursDeconnexion.forEach((cb) => cb()); return false; }
      const data = await r.json();
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch { return false; }
    finally { refreshEnCours = null; }
  })();
  return refreshEnCours;
}

interface Options extends Omit<RequestInit, 'body'> { body?: unknown; brut?: boolean; retry?: boolean }

export async function api<T = unknown>(chemin: string, opts: Options = {}): Promise<T> {
  const { body, brut, retry = true, headers, ...rest } = opts;
  const estForm = body instanceof FormData;
  const h: Record<string, string> = { ...(headers as Record<string, string>) };
  if (!estForm && body !== undefined) h['Content-Type'] = 'application/json';
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;

  const r = await fetch(`${BASE}${chemin}`, { ...rest, headers: h, body: estForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined });

  if (r.status === 401 && retry && tokens.refresh()) {
    if (await rafraichir()) return api<T>(chemin, { ...opts, retry: false });
  }
  if (!r.ok) {
    let payload: any = null;
    try { payload = await r.json(); } catch { /* corps vide */ }
    const message = Array.isArray(payload?.message) ? payload.message.join(' ; ') : payload?.message ?? r.statusText;
    throw new ApiError(r.status, payload?.code ?? 'ERREUR', message, payload?.erreurs, payload);
  }
  if (brut) return (await r.blob()) as unknown as T;
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const estHorsLigne = () => typeof navigator !== 'undefined' && !navigator.onLine;
