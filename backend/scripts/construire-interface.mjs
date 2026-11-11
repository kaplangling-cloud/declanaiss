/**
 * Construit l'interface (SPA) et la depose dans `backend/public`, pour les
 * hebergements qui ne construisent qu'un seul projet et n'ont pas de Nginx
 * devant l'API (Hostinger). L'API sert alors ce dossier via FRONTEND_DIST.
 *
 * Sous Docker, rien n'appelle ce script : l'interface y est construite dans son
 * propre etage et servie par Nginx.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(backend, '..', 'frontend');
const source = join(frontend, 'dist');
const cible = join(backend, 'public');

function executer(commande, args, cwd) {
  console.log(`> ${commande} ${args.join(' ')}  (${cwd})`);
  // shell: true — sur Windows, npm est un script .cmd et non un executable.
  const resultat = spawnSync(commande, args, { cwd, stdio: 'inherit', shell: true });
  if (resultat.status !== 0) {
    throw new Error(`Echec de « ${commande} ${args.join(' ')} » (code ${resultat.status}).`);
  }
}

if (!existsSync(frontend)) {
  throw new Error(
    `Dossier de l'interface introuvable : ${frontend}. Ce script attend le depot complet, ` +
      'pas le seul dossier backend.',
  );
}

// --include=dev : les outils de construction de l'interface (Vite, TypeScript)
// sont des devDependencies, et NODE_ENV=production les ferait omettre.
executer('npm', ['ci', '--include=dev'], frontend);
executer('npm', ['run', 'build'], frontend);

if (!existsSync(source)) {
  throw new Error(`Build de l'interface absent : ${source}.`);
}

// Table rase : un fichier d'un build precedent qui survivrait serait servi
// alors qu'aucun index ne le reference plus.
rmSync(cible, { recursive: true, force: true });
cpSync(source, cible, { recursive: true });

console.log(`Interface construite et deposee dans ${cible}`);
