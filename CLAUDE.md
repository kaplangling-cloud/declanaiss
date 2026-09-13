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
```

Backend (`cd backend`) :

```bash
npm run start:dev                  # API en watch sur :3000
npm run build                      # nest build + compilation du seed (tsconfig.seed.json)
npm run lint
npx tsc --noEmit -p tsconfig.json  # vérification de types seule
npm test                           # jest (aucun test écrit à ce jour)
npx jest chemin/du.spec.ts         # un seul fichier de test
npm run prisma:migrate             # créer + appliquer une migration (dev)
npm run prisma:deploy              # appliquer les migrations (prod)
SEED_PASSWORD='...' npm run seed   # jeu de démonstration ; refuse un mot de passe < 12 caractères
npm run import:decoupage           # (ré)importer le découpage administratif
```

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
- **Audit immuable chaîné.** `AuditService.journaliser()` calcule le SHA-256 du contenu concaténé au hash de l'entrée précédente ; `verifierChaine()` relit la chaîne et détecte toute altération ou suppression. Journaliser dans la même transaction que l'écriture métier, en passant le client transactionnel.
- **Fenêtre de modification de 7 jours.** Après soumission, `dateLimiteModification` est fixée ; une tâche planifiée (`jobs/`) verrouille ensuite les dossiers. Au-delà, la seule voie est une `Rectification` tracée, initiée par la mairie.

### Chiffrement au repos

`CryptoService` (AES-256-GCM, format `v1:iv:tag:ciphertext`) chiffre les numéros de CNI et les pièces jointes. Un **index aveugle** HMAC-SHA256 (`pereCniNumeroIndex`) permet la recherche par égalité sans stocker le clair. Le préfixe de version prépare une rotation de clé sans migration destructive.

Perdre `DATA_ENCRYPTION_KEY` rend les CNI et les pièces jointes définitivement illisibles.

### Numérotation

`NumerotationService` produit `{codeRégion}-{codeCentre}-{année}-{séquence sur 6}-{clé}`. La séquence vient de la table `sequences_declaration` incrémentée dans la transaction, ce qui verrouille la ligne : deux soumissions simultanées ne peuvent pas obtenir le même numéro. La clé de contrôle sur deux caractères (alphabet sans I ni O) détecte les fautes de frappe et de transposition lors d'une saisie manuelle sur la page de vérification publique.

Le numéro d'acte de mairie suit un autre format : `{codeMairie}/{année}/{séquence sur 5}`.

### Mode hors-ligne et synchronisation

Le frontend est une PWA : saisie en IndexedDB, file de synchronisation différée. Deux mécanismes côté serveur :

- **Idempotence** — chaque déclaration porte un `clientUuid` généré par le poste de saisie ; un rejeu réseau renvoie l'existant au lieu de créer un doublon.
- **Verrou optimiste** — le champ `version` est transmis à chaque modification ; une divergence renvoie `409 CONFLIT_VERSION` avec la version serveur, que l'interface présente à l'utilisateur.

### Acte de naissance (PDF)

`PdfActeService` reproduit le formulaire officiel camerounais bilingue, relevé sur un acte réel (`A1.jpeg`, volontairement **hors du dépôt** : il porte les noms et numéros de CNI de personnes réelles — ne jamais le versionner, ni reprendre ses données dans les tests ou exemples) : en-tête FR/EN sur deux colonnes, rubriques « libellé FR - label EN » suivies de pointillés, dates en toutes lettres (`dix-sept février mille neuf cent quatre-vingt-dix`), bloc de clôture et signatures. S'y ajoutent un QR vers la page publique de vérification et un code-barres Code 128 du numéro de déclaration.

L'en-tête porte le rattachement administratif de **la mairie qui dresse l'acte**, jamais celui du centre de santé ; `A - At` porte en revanche le lieu de l'accouchement.

Les données médicales (poids, mode d'accouchement, terme) restent dans la déclaration et ne figurent pas sur l'acte.

Le rendu est en coordonnées absolues : le pied de page (signatures, QR, code-barres) occupe une bande fixe et le corps est borné pour ne jamais y descendre. Après toute retouche de mise en page, régénérer un acte et le relire, y compris dans le cas défavorable (noms longs, mention marginale, absence de secrétaire).

### Référentiel administratif

10 régions, 58 départements, 360 arrondissements, codes officiels `R09-D50-A309`, dénominations FR (`nom`) et EN (`nomEn`). Source : `RDC.xlsx`, converti une fois en `backend/prisma/data/decoupage-administratif.json` pour éviter d'embarquer un lecteur Excel dans le backend. `import-decoupage.ts` est idempotent et rapproche les lignes existantes par nom normalisé (sans accent ni casse) avant de leur appliquer le code officiel.

### Extensibilité du modèle

`Declaration` porte `versionModele` et `donneesComplementaires` (JSON) : un champ peut être ajouté progressivement sans migration destructive. Les migrations doivent rester additives.

## Conventions

- Gardes globales dans cet ordre : `ThrottlerGuard`, puis `JwtAuthGuard`, puis `RolesGuard`. Une route publique se marque `@Public()` ; une route restreinte, `@Roles(...)`.
- Les contrôleurs reçoivent l'acteur via `@CurrentUser()` et le contexte de requête (IP, user-agent, ressource) via `@RequestContext()` — ce dernier alimente l'audit et le journal des accès.
- Ne jamais écrire de donnée personnelle dans les logs applicatifs.
- Les couleurs de l'interface sont le blanc et le vert (`primary` dans `tailwind.config.js`) ; le PDF suit la même identité.
