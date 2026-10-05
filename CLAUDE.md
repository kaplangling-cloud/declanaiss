# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Langue

Le code, les commentaires, les messages d'erreur, les libellés d'interface et les messages de commit sont **en français**. Les identifiants du modèle de données le sont aussi (`Declaration`, `enfantNom`, `perimetre`, `journaliser`). S'y conformer plutôt que de basculer en anglais.

Les identifiants et le contenu des fichiers source sont écrits **sans accents** (`declaration`, `numero`, `Referentiel`) ; les accents ne figurent que dans les chaînes destinées à l'utilisateur et dans le Markdown.

## Commandes

Toute la pile tourne en conteneurs ; c'est le mode nominal.

```bash
docker compose up -d               # démarrer (app + nginx + postgres) → http://localhost:8080
docker compose up -d --build       # après modification du code
docker compose logs -f app         # logs de l'API
docker compose down                # arrêter (les volumes pgdata et storage survivent)
docker compose -f docker-compose.yml -f docker-compose.preprod.yml up -d --build   # pré-production locale
```

La pré-production locale applique la configuration de production à l'API (`NODE_ENV=production` : secrets exigés, Swagger coupé) et ferme le port PostgreSQL sur l'hôte, mais garde Nginx en HTTP sur 8080 — `docker-compose.prod.yml` exige un domaine et un certificat. Dans ce mode, `npm run start:dev`, Prisma Studio et `psql` depuis l'hôte n'atteignent plus la base ; `docker compose up -d` revient au mode développement.

Backend (`cd backend`) :

```bash
npm run start:dev                  # API en watch sur :3000
npm run build                      # nest build + compilation du seed (tsconfig.seed.json)
npm run lint
npx tsc --noEmit -p tsconfig.json  # vérification de types seule
npm test                           # jest : tests unitaires *.spec.ts (hors image de production, cf. tsconfig.build.json)
npx jest chemin/du.spec.ts         # un seul fichier de test
npm run prisma:migrate             # créer + appliquer une migration (dev)
npm run prisma:deploy              # appliquer les migrations (prod)
SEED_PASSWORD='...' npm run seed   # jeu de démonstration ; mot de passe conforme à la politique (cf. Conventions)
npm run import:decoupage           # (ré)importer le découpage administratif
ADMIN_EMAIL='...' npm run admin:creer  # créer un administrateur national, audité ; mot de passe aléatoire affiché une fois
```

En conteneur, les scripts compilés s'exécutent depuis `/app` : `docker compose exec -e ADMIN_EMAIL=... app node dist/prisma/creer-admin.js`. Le dernier administrateur national actif ne peut être ni désactivé ni rétrogradé.

Frontend (`cd frontend`) : `npm run dev` (:5173, proxy `/api` → :3000), `npm run build`, `npm run lint`.

`start-dev.ps1` à la racine lance Postgres, les migrations, l'API et le frontend en une fois.

Le conteneur `app` applique `prisma migrate deploy` à chaque démarrage (voir son `CMD`) : une migration commitée part en production automatiquement.

## Environnement local

PostgreSQL est publié sur **5433** et non 5432 (ce port est occupé par un autre conteneur sur la machine de développement). `.env` et `backend/.env` ne sont pas versionnés ; les recréer depuis `.env.example`. En production, `configuration.ts` refuse de démarrer si un secret manque ou porte encore sa valeur d'exemple.

## Architecture

Trois services : SPA React servie par Nginx, qui relaie `/api` vers l'API NestJS, elle-même adossée à PostgreSQL via Prisma.

### Invariants du domaine

Ces règles traversent plusieurs modules ; les enfreindre casse la valeur légale des actes.

- **Aucune suppression physique.** Partout des suppressions logiques (`supprimeLe`, `desactiveLe`, `actif`). Une circonscription absente d'un import est signalée, jamais retirée : des déclarations y sont rattachées.
- **Une naissance = un enregistrement.** Les opérations sensibles (soumission, validation, édition d'acte) se déroulent dans une transaction Prisma unique couvrant l'attribution du numéro, l'écriture métier et l'audit.
- **Cloisonnement par structure.** Chaque service expose un `perimetre(acteur)` qui produit un `WhereInput` selon le rôle : un centre ne voit que ses déclarations, une mairie que celles qui lui sont adressées, l'administrateur national tout. Toute nouvelle requête sur `Declaration` ou `Acte` doit passer par là — ne jamais interroger ces tables sans filtre de périmètre.
- **Audit immuable chaîné.** `AuditService.journaliser()` calcule le SHA-256 du contenu concaténé au hash de l'entrée précédente ; `verifierChaine()` relit la chaîne et détecte toute altération ou suppression. Journaliser dans la même transaction que l'écriture métier, en passant le client transactionnel. Deux détails sont indispensables : l'écriture prend un verrou consultatif global (sans lui, deux transactions concurrentes font bifurquer la chaîne), et l'empreinte porte sur un JSON canonique à clés triées, car `jsonb` réordonne les clés à l'enregistrement.
- **Fenêtre de modification de 7 jours.** Après soumission, `dateLimiteModification` est fixée ; une tâche planifiée (`jobs/`) verrouille ensuite les dossiers. Au-delà, la seule voie est une `Rectification` tracée, initiée par la mairie.

### Chiffrement au repos

`CryptoService` (AES-256-GCM, format `v1:iv:tag:ciphertext`) chiffre les numéros de CNI et les pièces jointes. Un **index aveugle** HMAC-SHA256 (`pereCniNumeroIndex`) permet la recherche par égalité sans stocker le clair. Le préfixe de version prépare une rotation de clé sans migration destructive.

Les valeurs d'une rectification, conservées en JSON, portent elles aussi les CNI sous forme chiffrée ; l'audit masque leur forme en clair.

Perdre `DATA_ENCRYPTION_KEY` rend les CNI et les pièces jointes définitivement illisibles.

### Numérotation

`NumerotationService` produit `{codeRégion}-{codeCentre}-{année}-{séquence sur 6}-{clé}`. La séquence vient de la table `sequences_declaration`, incrémentée dans la transaction sous un verrou consultatif PostgreSQL propre au centre et à l'année (`pg_advisory_xact_lock`) : les soumissions simultanées sont sérialisées, y compris la première de l'année, qui créerait sinon deux fois la même ligne. La clé de contrôle sur deux caractères (alphabet sans I ni O) détecte les fautes de frappe et de transposition lors d'une saisie manuelle sur la page de vérification publique.

Le numéro d'acte de mairie suit un autre format, `{codeMairie}/{année}/{séquence sur 5}`, sous le même type de verrou, par mairie et par année. Le dernier numéro est retrouvé par le **maximum numérique** de la séquence, jamais par tri du numéro complet : une mairie peut avoir changé de code en cours d'année (`EBO1/…` puis `09050309/…`), et un tri alphabétique redonnerait la même séquence.

### Mode hors-ligne et synchronisation

Le frontend est une PWA : saisie en IndexedDB, file de synchronisation différée. Deux mécanismes côté serveur :

- **Idempotence** — chaque déclaration porte un `clientUuid` généré par le poste de saisie ; un rejeu réseau renvoie l'existant au lieu de créer un doublon.
- **Verrou optimiste** — le champ `version` est transmis à chaque modification ; une divergence renvoie `409 CONFLIT_VERSION` avec la version serveur, que l'interface présente à l'utilisateur.

### Acte de naissance (PDF)

`PdfActeService` reproduit le formulaire officiel camerounais bilingue, relevé sur un acte réel (`A1.jpeg`, volontairement **hors du dépôt** : il porte les noms et numéros de CNI de personnes réelles — ne jamais le versionner, ni reprendre ses données dans les tests ou exemples) : en-tête FR/EN sur deux colonnes, rubriques « libellé FR - label EN » suivies de pointillés, dates en toutes lettres (`dix-sept février mille neuf cent quatre-vingt-dix`), bloc de clôture et signatures. S'y ajoutent un QR vers la page publique de vérification et un code-barres Code 128 du numéro de déclaration.

L'en-tête porte le rattachement administratif de **la mairie qui dresse l'acte**, jamais celui du centre de santé ; `A - At` porte en revanche le lieu de l'accouchement.

Les données médicales (poids, mode d'accouchement, terme) restent dans la déclaration et ne figurent pas sur l'acte.

Le rendu est en coordonnées absolues : le pied de page (signatures, QR, code-barres) occupe une bande fixe et le corps est borné pour ne jamais y descendre. Après toute retouche de mise en page, régénérer un acte et le relire, y compris dans le cas défavorable (noms longs, mention marginale, absence de secrétaire).

### Déclaration imprimable (PDF)

`PdfDeclarationService` (`GET /declarations/:id/pdf`) produit la déclaration que le centre remet aux parents pour le guichet de la mairie. Même identité visuelle que l'acte, avec trois différences à préserver :

- l'en-tête porte le rattachement administratif **du centre de santé** (et le Ministère de la Santé publique), pas celui de la mairie ;
- les données médicales y figurent (constat de l'accouchement) ;
- le document rappelle qu'il n'est pas un acte, et une déclaration `REJETEE` porte un bandeau « document non définitif ».

Il est généré à la demande, sans copie stockée, et refusé pour un brouillon (pas de numéro). Les CNI sont masquées pour `SECRETAIRE_MAIRIE`, comme à l'écran ; chaque édition est journalisée (`EXPORT`) et tracée dans le journal des accès. Même règle de relecture que pour l'acte après toute retouche de mise en page.

### Référentiel administratif

10 régions, 58 départements, 360 arrondissements, codes officiels `R09-D50-A309`, dénominations FR (`nom`) et EN (`nomEn`). Source : `RDC.xlsx`, converti une fois en `backend/prisma/data/decoupage-administratif.json` pour éviter d'embarquer un lecteur Excel dans le backend. `import-decoupage.ts` est idempotent et rapproche les lignes existantes par nom normalisé (sans accent ni casse) avant de leur appliquer le code officiel.

Le code d'une mairie (centre d'état civil) n'est jamais saisi : il dérive de son arrondissement selon la colonne « Code unique » de `RDC.xlsx`, région sur 2 chiffres + département sur 3 + arrondissement sur 3 (`R09-D50-A309` → `09050309`), via `codeCentreEtatCivil()`. Un seul centre par arrondissement. Ce code entre dans le numéro des actes : une mairie qui en a dressé ne peut plus en changer, et l'import ne réaligne que les mairies sans acte.

### Comptes, centres et mairies

- **Personnel de santé** : un compte `PERSONNEL_SANTE` choisit sa fonction dans `FONCTIONS_PERSONNEL` (`common/referentiel/fonctions-personnel.ts`, reprise dans `frontend/src/types.ts`) — Docteur, Sage-femme, Infirmier(ère) accoucheur(se). La fonction est portée par la fiche `PersonnelSante` liée au compte, créée avec lui : elle figure sur la déclaration et sur l'acte.
- **Centre** : son code entre dans le numéro de déclaration, il est donc figé dès la première déclaration numérotée. La cohérence région > département > arrondissement se vérifie sur l'état résultant, pas sur les seuls champs envoyés.
- **Rattachement centre → mairie** : la mairie destinataire d'une déclaration est fixée à sa **première soumission**, d'après le rattachement du centre à ce moment-là (un brouillon antérieur à un changement de rattachement part à la nouvelle mairie). Une mairie à laquelle des centres actifs sont rattachés ne peut pas être désactivée.

### Extensibilité du modèle

`Declaration` porte `versionModele` et `donneesComplementaires` (JSON) : un champ peut être ajouté progressivement sans migration destructive. Les migrations doivent rester additives.

## Conventions

- Gardes globales dans cet ordre : `ThrottlerGuard`, puis `JwtAuthGuard`, puis `RolesGuard`. Une route publique se marque `@Public()` ; une route restreinte, `@Roles(...)`.
- Les contrôleurs reçoivent l'acteur via `@CurrentUser()` et le contexte de requête (IP, user-agent, ressource) via `@RequestContext()` — ce dernier alimente l'audit et le journal des accès.
- L'IP vient de `req.ip`, avec `trust proxy` réglé sur un seul saut (Nginx) dans `main.ts` (`TRUST_PROXY_HOPS`, 1 par défaut). Ne jamais lire la première valeur de `X-Forwarded-For` : le client la fournit et pourrait falsifier l'audit. Le même `req.ip` alimente la limitation de débit par client.
- Connexion par adresse e-mail **ou** nom d'utilisateur (`nomUtilisateur`, facultatif, unique, stocké en minuscules) : `POST /auth/login` reçoit `identifiant`, et la présence d'un `@` désigne l'e-mail — d'où l'interdiction du `@` dans un nom d'utilisateur (`users/nom-utilisateur.ts`). L'ancien champ `email` reste accepté pour les postes hors-ligne non mis à jour.
- **Mots de passe** : 8 caractères minimum, dont une majuscule (accentuée acceptée), un chiffre et un caractère spécial, définis dans `common/mot-de-passe.ts` (décorateur `@EstMotDePasseRobuste()`, miroir `frontend/src/lib/mot-de-passe.ts`). La règle s'applique à chaque mot de passe choisi ou attribué ; un mot de passe enregistré sous l'ancienne règle reste valable jusqu'à son changement. Les scripts génèrent des mots de passe provisoires conformes (`motDePasseAleatoire()`).
- Ne jamais écrire de donnée personnelle dans les logs applicatifs.
- Les couleurs de l'interface sont le blanc et le vert (`primary` dans `tailwind.config.js`) ; le PDF suit la même identité.
- Interface : polices Inter / JetBrains Mono et icônes `lucide-react` intégrées au bundle (aucune ressource externe : CSP de production et mode hors-ligne). Les graphiques des tableaux de bord (`components/Graphiques.tsx`) sont dessinés en CSS, sans bibliothèque ; leurs données viennent de `GET /declarations/resume` (`parStatut`, `parMois` sur 12 mois, brouillons exclus), soumis au périmètre — donc accessible au personnel de santé, contrairement à `/stats`.
