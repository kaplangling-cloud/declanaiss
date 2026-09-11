# Déclaration de naissance en ligne — centres de santé → mairies

Application web de digitalisation de la déclaration des naissances entre les centres de santé (cliniques, hôpitaux, maternités) et les mairies compétentes au Cameroun, en vue de l'établissement des actes de naissance.

| Couche | Technologie |
|---|---|
| Frontend | React 18 + TypeScript, Tailwind CSS (blanc / vert), PWA (Service Worker + IndexedDB, saisie hors-ligne et synchronisation différée) |
| Backend | Node.js + NestJS (TypeScript), modules par domaine métier |
| Base de données | PostgreSQL 16, ORM Prisma |
| Authentification | JWT access (15 min) + refresh (7 j, rotation, détection de rejeu), RBAC strict |
| Documents | pdf-lib (acte PDF) + bwip-js (QR code + code-barres Code 128) |
| Tâches planifiées | `@nestjs/schedule` / cron — verrouillage automatique à J+7 |
| Déploiement | Docker Compose (app, postgres, nginx), Ubuntu Server, HTTPS Let's Encrypt |

---

## 1. Démarrage rapide (local)

```bash
cp .env.example .env            # puis renseigner les secrets (voir §6)
docker compose up --build -d
docker compose exec app sh -c "SEED_PASSWORD='MotDePasseInitial2026!' node dist/prisma/seed.js"
```

- Application : http://localhost:8080
- API + Swagger : http://localhost:8080/api/docs (hors production)
- Vérification publique : http://localhost:8080/verifier

Comptes créés par le seed (mot de passe = `SEED_PASSWORD`, changement obligatoire à la première connexion) :

| Compte | Rôle |
|---|---|
| `admin@declanaiss.local` | Administrateur national |
| `chef.hrebo@declanaiss.local` | Chef de centre (Hôpital Régional d'Ebolowa) |
| `sagefemme.hrebo@declanaiss.local` | Personnel de santé |
| `officier.ebo1@declanaiss.local` | Officier d'état civil (Mairie d'Ebolowa 1er) |
| `secretaire.ebo1@declanaiss.local` | Secrétaire de mairie |

### Développement sans Docker

```bash
# Backend
cd backend && npm install
npx prisma migrate dev --name init     # crée la première migration
npm run start:dev                      # http://localhost:3000/api

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173 (proxy /api → 3000)
```

> La première migration n'est pas versionnée dans ce dépôt : `prisma migrate dev --name init` la génère depuis `backend/prisma/schema.prisma`. En production, `prisma migrate deploy` est exécuté au démarrage du conteneur `app` (jamais de `migrate reset`).

---

## 2. Structure du projet

```
├── backend/
│   ├── prisma/schema.prisma      # modèle complet (§3)
│   ├── prisma/seed.ts
│   └── src/
│       ├── auth/                 # login, refresh (rotation), logout, changement de mot de passe
│       ├── users/                # comptes, périmètre de gestion par rôle
│       ├── centres/              # centres de santé + personnel habilité
│       ├── mairies/              # mairies + référentiel géographique
│       ├── declarations/         # cycle de vie, sync hors-ligne, pièces jointes, rectifications
│       ├── actes/                # édition de l'acte, PDF + QR/code-barres
│       ├── audit/                # journal immuable chaîné par hash, journal d'accès
│       ├── verification/         # page publique authentique / introuvable
│       ├── stats/                # synthèse + export CSV
│       ├── jobs/                 # verrouillage automatique J+7
│       ├── storage/              # stockage disque chiffré (pièces) / PDF
│       └── common/               # chiffrement AES-256-GCM, numérotation, guards RBAC, filtres
├── frontend/src/
│   ├── lib/api.ts                # client HTTP, refresh transparent
│   ├── lib/db.ts                 # IndexedDB (brouillons, référentiels)
│   ├── lib/sync.ts               # file de synchronisation, conflits
│   ├── lib/validation.ts         # schémas zod (miroir des règles serveur)
│   └── pages/                    # centre/, mairie/, admin/, DeclarationDetail, Stats, VerifierPublic
├── nginx/                        # Dockerfile (build frontend + nginx), conf HTTP et HTTPS
├── scripts/backup.sh, restore.sh # sauvegardes chiffrées
├── docker-compose.yml            # local
├── docker-compose.prod.yml       # production (HTTPS, certbot, backup)
└── .env.example
```

---

## 3. Modèle de données (résumé)

- **Region / Departement / Arrondissement** : référentiel administratif bilingue (`nom` FR, `nomEn` EN, `chefLieu`, `codeUnique`) alimentant l'en-tête de l'acte. Le code région entre dans le numéro de déclaration. Voir §3.1.
- **Mairie** : centre d'état civil de rattachement.
- **Centre** : nom, adresse, n° d'autorisation (délivrance + validité), rattachement, chef de centre (nom, fonction, contact), mairie compétente.
- **PersonnelSante** : personnel habilité à déclarer (nom, fonction, n° d'ordre), compte de connexion optionnel.
- **User** : rôles `PERSONNEL_SANTE`, `CHEF_CENTRE`, `OFFICIER_ETAT_CIVIL`, `SECRETAIRE_MAIRIE`, `ADMIN_NATIONAL`.
- **Declaration** : enfant (nom, prénoms, date/heure, sexe, mode et terme d'accouchement, mois de grossesse si prématuré, poids), père et mère (identité, profession, domicile, nationalité, date/lieu de naissance, CNI chiffrée + date de délivrance), personnel accoucheur, déclarant, statut, numéro unique, QR token, fenêtre de modification, versions.
- **PieceJointe** : CNI père/mère, acte de mariage, autre — fichiers chiffrés, SHA-256, suppression logique uniquement.
- **Acte** : numéro de registre, date de dressage, officier, secrétaire, mention marginale, PDF + empreinte.
- **Rectification** : procédure tracée initiée par la mairie (motif, champs, valeurs avant/après, référence légale, décision).
- **AuditLog** (chaîné par hash, jamais modifié), **AccessLog** (accès aux données personnelles), **VerificationLog**.

### 3.1 Découpage administratif (RDC.xlsx)

Le référentiel officiel — **10 régions, 58 départements, 360 arrondissements** avec les codes `R09`, `D50`, `A309` et le code unique `R09-D50-A309` — provient du classeur `RDC.xlsx` (source : INS / MINAT / Osidimbea).

Le classeur est converti une fois en données de référence versionnées, pour ne pas embarquer de lecteur Excel dans le backend :

```
backend/prisma/data/decoupage-administratif.json   # données issues de RDC.xlsx
backend/prisma/import-decoupage.ts                 # import idempotent
```

```bash
cd backend && npm run import:decoupage      # rejouable à volonté
```

L'import rapproche les lignes existantes par nom normalisé (sans accent ni casse) et leur applique le code officiel : **aucune suppression**, aucun doublon. Une circonscription présente en base mais absente du fichier est signalée et conservée (des déclarations peuvent y être rattachées). Le seed appelle cet import automatiquement.

Les dénominations anglaises des 10 régions (`ADAMAWA`, `FAR NORTH`, `NORTH WEST`…) sont portées par `nomEn`; pour les départements et arrondissements, `nomEn` reprend le nom français, ces toponymes étant identiques dans les deux langues sur le formulaire officiel. Le champ reste modifiable au cas par cas.

> Le classeur signale lui-même que certaines dénominations d'arrondissements ont pu être ajustées par des textes récents : à vérifier auprès du MINAT avant usage officiel.

### Numéro unique de déclaration
`{codeRégion}-{codeCentre}-{année}-{séquence 6 chiffres}-{clé}` — ex. `SU-HREBO-2026-000123-K7`.
La séquence est attribuée dans la transaction de soumission (verrou de ligne par centre et par année : pas de doublon possible). La clé de contrôle (Luhn mod N, alphabet sans I/O) détecte fautes de frappe et transpositions lors d'une saisie manuelle.

### Cycle de vie
```
BROUILLON ──soumettre──▶ SOUMISE ──valider──▶ VALIDEE ──éditer l'acte──▶ (Acte)
    ▲                       │  │
    │                       │  └──rejeter (motif)──▶ REJETEE ──corriger + re-soumettre──▶ SOUMISE
    │                       └──J+7 (job)──▶ VERROUILLEE ──valider / rejeter (mairie)
    └── modifiable par le centre : BROUILLON, REJETEE, SOUMISE tant que J+7 non atteint
Après VERROUILLEE / VALIDEE : modification uniquement par Rectification (mairie), tracée.
```
Après un rejet, la re-soumission ouvre une nouvelle fenêtre de 7 jours (la mairie a explicitement demandé une correction).

---

## 4. Fonctionnement hors-ligne (PWA)

1. L'application (shell) est mise en cache par le Service Worker ; l'API n'est **jamais** mise en cache (données personnelles), sauf le référentiel géographique et la liste du personnel.
2. Chaque déclaration porte un `clientUuid` généré sur le poste : c'est la clé d'idempotence. Une re-transmission réseau ne crée jamais de doublon.
3. Les brouillons sont stockés dans IndexedDB avec la `versionBase` serveur connue ; la file est visible dans l'en-tête et sur la page *Synchronisation*.
4. `POST /api/declarations/sync` traite un lot élément par élément (une transaction chacun). Réponses : `CREEE`, `MISE_A_JOUR`, `INCHANGEE`, `CONFLIT`, `ERREUR`.
5. **Conflit** (double saisie / modification depuis un autre poste) : le serveur renvoie son état ; l'utilisateur choisit *garder la version serveur* ou *écraser* (uniquement si le serveur est encore en brouillon).
6. Une fois acceptée par le serveur, la copie locale est supprimée : aucune donnée personnelle ne persiste sur le poste au-delà du nécessaire.

---

## 5. Sécurité et conformité

- **Chiffrement au repos** : numéros de CNI et pièces jointes chiffrés en AES-256-GCM (clé `DATA_ENCRYPTION_KEY`, format versionné pour permettre une rotation). Index aveugle HMAC pour la recherche par égalité.
- **Journalisation des accès** : chaque lecture d'une déclaration (CNI, poids) ou d'une pièce est tracée dans `access_logs` (utilisateur, ressource, IP).
- **Audit immuable** : `audit_logs` est en écriture seule, chaque entrée porte le hash de la précédente ; `GET /api/audit/integrite` recalcule la chaîne. Aucune suppression physique dans tout le modèle.
- **Cloisonnement** : le périmètre est imposé dans chaque requête Prisma (`centreId` / `mairieId`), pas seulement dans les contrôleurs. Une mairie ne voit jamais les brouillons ; une secrétaire voit les CNI masquées.
- **Comptes** : argon2id, blocage 15 min après 5 échecs, changement de mot de passe obligatoire à la création, révocation immédiate (l'utilisateur est rechargé à chaque requête), rotation des refresh tokens avec détection de rejeu.
- **API** : Helmet, CORS restreint, rate limiting (login, vérification publique), validation stricte des DTO (`whitelist` + `forbidNonWhitelisted`), erreurs sans détail technique.
- **Vérification publique** : ne renvoie que `AUTHENTIQUE` / `INTROUVABLE` (+ type et année), jamais de donnée nominative ; chaque tentative est journalisée.

### Politique de rétention et de sauvegarde (recommandation)
- Sauvegarde **quotidienne** (02:00) de la base et du stockage, chiffrée GPG (`scripts/backup.sh`), vérifiable (`SHA256SUMS`).
- Conservation **minimale de 10 ans** (`BACKUP_RETENTION_DAYS=3650`) compte tenu de la valeur légale des actes ; les actes eux-mêmes ne sont jamais purgés de la base.
- Copie hors site obligatoire (rsync/rclone vers un second site ou un stockage objet), clé privée GPG conservée hors du serveur.
- Restauration : `scripts/restore.sh`. Tester la restauration au moins une fois par trimestre.

---

## 6. Variables d'environnement

Voir `.env.example`. Génération des secrets :
```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
openssl rand -base64 32   # DATA_ENCRYPTION_KEY, BLIND_INDEX_KEY (32 octets exactement)
```
En production, l'application **refuse de démarrer** si un secret est absent ou laissé à sa valeur d'exemple.

⚠️ La perte de `DATA_ENCRYPTION_KEY` rend les CNI et les pièces jointes définitivement illisibles : la conserver dans un coffre (et dans la sauvegarde hors site, séparément des données).

---

## 7. Déploiement production (Ubuntu Server)

```bash
# 1. Prérequis
sudo apt install docker.io docker-compose-plugin
git clone <dépôt> /opt/declanaiss && cd /opt/declanaiss
cp .env.example .env && nano .env      # SERVER_NAME, secrets, BACKUP_GPG_RECIPIENT…
sudo mkdir -p /var/backups/declanaiss

# 2. Premier certificat Let's Encrypt (nginx doit répondre en HTTP sur le domaine)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot -d "$SERVER_NAME" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email

# 3. Démarrage complet
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec app sh -c "SEED_PASSWORD='…' node dist/prisma/seed.js"   # ou créer l'admin manuellement
```
Le service `certbot` renouvelle automatiquement ; recharger nginx après renouvellement (`docker compose exec nginx nginx -s reload`, à placer dans un cron hebdomadaire).

---

## 8. API (extrait)

| Méthode | Route | Rôles |
|---|---|---|
| POST | `/api/auth/login`, `/refresh`, `/logout`, `/mot-de-passe` | public / authentifié |
| GET/POST/PATCH | `/api/declarations`, `/:id`, `/:id/soumettre` | centre |
| POST | `/api/declarations/sync` | centre (lot hors-ligne) |
| POST | `/api/declarations/:id/valider`, `/rejeter` | officier |
| POST/GET/DELETE | `/api/declarations/:id/pieces[/:pieceId]` | centre (ajout), tous (lecture) |
| POST | `/api/declarations/:id/rectifications`, `/:rid/decision` | officier, admin |
| POST | `/api/actes/declaration/:declarationId` | officier (édition + PDF) |
| GET | `/api/actes/:id/pdf` | selon périmètre |
| GET | `/api/verification/:reference` | **public** |
| GET | `/api/audit`, `/api/audit/integrite` | admin |
| GET | `/api/stats`, `/api/stats/export.csv` | admin, mairie, chef de centre |
| GET | `/api/sante` | public (sonde) |

---

## 9. Évolutivité du modèle d'acte

- `Declaration.donneesComplementaires` (JSON) + `versionModele` permettent d'ajouter des champs sans migration destructive ; une fois stabilisés, les promouvoir en colonnes par une migration additive (`ADD COLUMN … NULL`).
- Les migrations Prisma sont toujours additives ; un champ n'est jamais supprimé, il est déprécié.
- Le format des données chiffrées est versionné (`v1:`), ce qui permet une rotation de clé progressive.
