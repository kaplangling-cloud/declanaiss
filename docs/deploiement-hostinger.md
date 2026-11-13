# Déploiement sur Hostinger (hébergement web + Supabase)

Ce guide décrit le déploiement sur un **hébergement web Hostinger** (plan mutualisé/Cloud,
ici *Unlimited Web Hosting*), la base PostgreSQL restant chez **Supabase**.

> **À lire avant de choisir cette voie.** Hostinger ne propose **que MySQL** sur
> l'hébergement web. Or la numérotation des actes et la chaîne d'audit reposent sur
> `pg_advisory_xact_lock` et `jsonb` : PostgreSQL est une exigence du domaine, pas une
> préférence. La base vit donc hors de Hostinger. Si l'on veut tout réunir sur un seul
> serveur — base, sauvegardes chiffrées, Nginx, certificats — c'est un **VPS Hostinger**
> qu'il faut, et `docker-compose.prod.yml` s'y déploie sans modifier une ligne de code
> (l'API VPS pilote Docker Compose directement).

## Ce qui change par rapport au déploiement Docker

Sur l'hébergement web il n'y a ni Docker ni Nginx : **l'API devient le seul serveur HTTP**
et sert aussi l'interface. Trois conséquences, toutes déjà prises en charge par le code :

| Assuré par Nginx sous Docker | Assuré ici |
| --- | --- |
| Service de la SPA et repli `try_files … /index.html` | `FRONTEND_DIST` dans `backend/src/main.ts` |
| CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` | Helmet, même politique mot pour mot |
| Cache : `immutable` sur `assets/`, `no-cache` sur `sw.js` / manifeste / index | `appliquerCache()` dans `main.ts` |
| `limit_req` sur `/api/auth/login` et `/api/verification` | `@Throttle` déjà posé sur ces routes (10/min et 20/min) |
| Terminaison TLS et renouvellement Certbot | Certificat géré par Hostinger |
| Sauvegardes chiffrées quotidiennes (service `backup`) | **Non couvert** — voir « Sauvegardes » |

Le build est lui aussi différent : l'hébergeur ne construit qu'un seul projet. Le script
`build:heberge` du backend construit donc aussi l'interface et la dépose dans
`backend/public`, que `FRONTEND_DIST` désigne ensuite.

### Les fichiers statiques ne passent pas par l'API

Point vérifié en production, et contre-intuitif : à la publication, Hostinger synchronise
le build dans `public_html`, et **LiteSpeed sert lui-même tout fichier qui existe là**.
Seules les requêtes sans fichier correspondant atteignent l'application Node.

Autrement dit, `/` et les routes de navigation sont servies par l'API — avec sa CSP et
ses règles de cache — mais `/assets/…`, `sw.js` et `manifest.webmanifest` sont servis par
LiteSpeed, avec ses propres types MIME et aucun en-tête de cache. Observé tel quel :

| Fichier | Sans `.htaccess` | Conséquence |
| --- | --- | --- |
| `manifest.webmanifest` | `text/plain` | **La PWA ne s'installe pas** : le navigateur refuse un manifeste qui n'est pas du JSON — la saisie hors ligne tombe |
| `assets/*.js` | `application/x-javascript`, sans cache | Les fichiers empreintés perdent leur cache d'un an |

D'où `frontend/public/.htaccess`, que Vite recopie à la racine du build : il rétablit les
types MIME et les règles de cache. Il suit l'interface jusqu'à `public_html` à chaque
déploiement, et Nginx l'ignore sous Docker. **Après toute modification de la mise en page
du build, vérifier le type renvoyé pour le manifeste** — c'est le symptôme le plus
silencieux de cette architecture.

## Préalables

1. **Un domaine.** Le plan inclut un domaine gratuit (hPanel → Domaines), à réclamer puis
   à rattacher à un **site distinct** : ne pas déployer par-dessus un site existant, un
   déploiement en écrase le contenu.
2. **GitHub connecté à Hostinger**, une seule fois, dans hPanel → Site web → Git.
3. **Le projet Supabase prêt** : `scripts/preparer-supabase.sh` applique les migrations,
   importe le découpage administratif et crée l'administrateur national. Utiliser le
   *Session pooler* (port **5432**, `sslmode=require`) — **jamais** le mode transaction
   (6543), qui casse les verrous consultatifs de la numérotation et de l'audit.

## Déploiement

Réglages de build à déclarer pour le site Node.js :

| Réglage | Valeur |
| --- | --- |
| Type | `nodejs` |
| Version de Node | `24` |
| Framework | `nest` |
| Répertoire racine | `backend` |
| Script de build | `build:heberge` |
| Répertoire de sortie | `dist` |
| Fichier d'entrée | `main.js` (relatif au répertoire de sortie) |

`backend/.npmrc` force `include=dev` : sans lui, un `npm install` exécuté avec
`NODE_ENV=production` omettrait la CLI NestJS, TypeScript et Prisma, et la construction
échouerait sur « nest : commande introuvable ».

Chaque poussée sur `main` relance la construction (déploiement automatique).

## Variables d'environnement

À poser sur le site Node.js (hPanel, ou l'API Hostinger). Valeurs réelles jamais
versionnées.

```
NODE_ENV=production
APP_PUBLIC_URL=https://<domaine>
CORS_ORIGINS=https://<domaine>
TZ=Africa/Douala

DATABASE_URL=<pooler session Supabase, port 5432, sslmode=require>
DIRECT_URL=<identique>

JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
DATA_ENCRYPTION_KEY=<openssl rand -base64 32>
BLIND_INDEX_KEY=<openssl rand -base64 32>

FRONTEND_DIST=./public
STORAGE_ROOT=/home/<utilisateur>/declanaiss-storage
TRUST_PROXY_HOPS=<à vérifier, voir ci-dessous>

# Facultatif : envoi des courriels (réinitialisation de mot de passe)
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

Deux points méritent attention.

**`STORAGE_ROOT` doit rester hors du dossier déployé.** Un déploiement écrase le contenu
du site : des pièces jointes rangées dedans disparaîtraient à la mise à jour suivante.

**`DATA_ENCRYPTION_KEY` est irremplaçable.** La perdre rend les numéros de CNI et les
pièces jointes définitivement illisibles. La conserver hors de la plateforme.

### Envoi des courriels (réinitialisation de mot de passe)

La réinitialisation de mot de passe par e-mail a besoin d'un serveur SMTP. Les variables
sont **facultatives** : sans elles l'API démarre normalement, mais la route répond 503 et
il ne reste que la réinitialisation par un administrateur depuis l'écran *Comptes*.

Hostinger fournit une messagerie avec l'hébergement. Créer une boîte dans
hPanel → **E-mails** (par exemple `ne-pas-repondre@votre-domaine`), puis :

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=ne-pas-repondre@votre-domaine
SMTP_PASSWORD=<mot de passe de la boîte>
SMTP_FROM=ne-pas-repondre@votre-domaine
```

Trois points comptent :

- `SMTP_FROM` doit appartenir au domaine authentifié. Une adresse d'un autre domaine part
  en courrier indésirable, voire est rejetée.
- Le port 465 utilise un TLS implicite (`SMTP_SECURE=true`). Sur le port 587, c'est
  STARTTLS : mettre `SMTP_SECURE=false`.
- Les enregistrements **SPF et DKIM** du domaine doivent être en place (Hostinger les pose
  à la création de la boîte) ; sans eux, les messages arrivent mal, et le lien de
  réinitialisation donne l'impression de ne jamais partir.

Après avoir renseigné ces variables, redémarrer l'application : elles sont lues au
démarrage du processus.

### Vérifier `TRUST_PROXY_HOPS`

L'API lit l'IP du client dans `req.ip`, qui alimente **l'audit** et **la limitation de
débit**. Une valeur trop faible fait voir à l'application l'IP du frontal de Hostinger :
tous les postes du pays partagent alors un seul compteur, et la connexion se bloque à
10 tentatives par minute pour tout le monde — l'audit, lui, enregistre une IP fausse.
Une valeur trop élevée laisserait un client forger son IP via `X-Forwarded-For`.

Après le premier déploiement, se connecter depuis deux réseaux distincts et comparer les
IP enregistrées dans le journal d'audit : elles doivent différer et correspondre aux IP
publiques réelles. Ajuster la variable, puis redémarrer l'application.

## Migrations

Le conteneur Docker applique `prisma migrate deploy` à chaque démarrage
(`backend/docker-entrypoint.sh`) ; ici, rien ne le fait. Après toute migration ajoutée :

```bash
set -a && . ./.env.supabase && set +a
cd backend && npx prisma migrate deploy
```

`migrate deploy` n'applique que les migrations en attente et ne réinitialise jamais la
base : le rejouer est sans effet.

## Verrouillage des dossiers à 7 jours

La tâche de verrouillage tourne dans le processus Node (`@nestjs/schedule`, `LOCK_CRON`).
Si l'hébergeur arrête le processus faute de trafic, elle ne s'exécute plus. Un *cron* de
compte peut servir de filet en réveillant l'application :

```
*/15 * * * *  curl -s -o /dev/null https://<domaine>/api/sante
```

## Sauvegardes

Le service `backup` du compose (dump quotidien chiffré GPG, rétention longue) **n'existe
pas ici**. Les sauvegardes de l'hébergement Hostinger ne couvrent que les fichiers du
site, pas la base : celle-ci dépend des sauvegardes Supabase, dont la rétention varie
selon le plan. Pour des actes d'état civil, prévoir un dump chiffré régulier hors
plateforme — `scripts/backup.sh` fonctionne depuis n'importe quelle machine disposant des
adresses Supabase.

## Limites connues de cette architecture

- Les données d'état civil chiffrées résident hors de Hostinger (Supabase, `eu-north-1`).
- Pas de sauvegarde chiffrée automatique de la base (ci-dessus).
- Pas de maîtrise du frontal HTTP : les en-têtes dépendent de l'application seule.
- Le stockage des pièces jointes vit sur le disque du compte mutualisé, sans réplication.

Ces quatre points disparaissent sur un VPS avec `docker-compose.prod.yml`.
