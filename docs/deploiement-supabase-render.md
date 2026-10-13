# Déploiement : base Supabase + API et interface sur Render

Ce guide déploie l'application depuis GitHub (`kaplangling-cloud/declanaiss`, branche `main`).

| Service | Hébergeur | Rôle |
|---|---|---|
| Base PostgreSQL | **Supabase** | données, journal d'audit |
| `declanaiss-api` | **Render** (Docker, offre *Starter* + disque) | API NestJS, pièces jointes et PDF d'actes |
| `declanaiss-web` | **Render** (site statique) | interface PWA ; relaie `/api` vers l'API |

Tout est décrit dans [`render.yaml`](../render.yaml) : chaque push sur `main` redéploie automatiquement les deux services.

> **Avant de commencer** : ces données sont des actes d'état civil (noms, dates de naissance, CNI chiffrées). Les héberger chez Supabase et Render, c'est-à-dire hors du Cameroun, peut nécessiter une autorisation de l'autorité compétente. À valider avant toute mise en service réelle.

## 1. Préparer la base Supabase

1. Dans Supabase, ouvrez le projet, puis **Project Settings › Database › Connection string**, et choisissez **Session pooler**. Ce mode est compatible IPv4, ce qu'exige Render, et il prend en charge les verrous PostgreSQL utilisés pour la numérotation et l'audit.
2. À la racine du dépôt, copiez `.env.supabase.example` en `.env.supabase`. Ce fichier n'est jamais versionné. Renseignez :
   - `DATABASE_URL` et `DIRECT_URL` : l'adresse du *Session pooler*, terminée par `?sslmode=require` ;
   - `ADMIN_EMAIL` et `ADMIN_USERNAME` du premier administrateur national.
3. Lancez :
   ```bash
   bash scripts/preparer-supabase.sh
   ```
   Le script applique les migrations, importe le découpage administratif (10 régions, 58 départements, 360 arrondissements), puis crée l'administrateur. **Notez le mot de passe provisoire affiché** : il n'apparaît qu'une fois et devra être changé à la première connexion.

Région conseillée pour le projet Supabase : **Frankfurt (eu-central-1)**, la même que Render, pour limiter la latence.

## 2. Créer les services Render

1. Sur [dashboard.render.com](https://dashboard.render.com), choisissez **New › Blueprint**, autorisez l'accès au dépôt GitHub `kaplangling-cloud/declanaiss`, puis sélectionnez la branche `main`. Render lit `render.yaml` et propose les deux services.
2. Render demande les variables marquées `sync: false` : collez dans `DATABASE_URL` et `DIRECT_URL` les mêmes adresses que dans `.env.supabase`.
3. Validez. Render construit l'image Docker de l'API (Node 24), applique les migrations au démarrage, puis publie l'interface.

Les secrets (`JWT_*`, `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`) sont générés par Render à la création.

> **Sauvegardez immédiatement `DATA_ENCRYPTION_KEY` et `BLIND_INDEX_KEY`** hors de Render (coffre-fort de mots de passe). Les perdre rend les numéros de CNI et les pièces jointes **définitivement illisibles**.

## 3. Vérifications après le premier déploiement

1. **Adresses** : si Render a attribué à l'API un autre sous-domaine que `declanaiss-api.onrender.com`, corrigez la règle `/api/*` de `render.yaml`. Faites de même pour `APP_PUBLIC_URL` et `CORS_ORIGINS` si l'interface n'est pas sur `declanaiss-web.onrender.com`. Poussez ensuite la correction sur `main`.
2. **Santé** : `https://declanaiss-web.onrender.com/api/sante` doit répondre `200`.
3. **Adresse IP réelle** : elle alimente l'audit et la limitation de débit. Ouvrez la page de vérification publique, puis, dans Supabase (SQL Editor), lancez :
   ```sql
   select ip, reference, "createdAt" from verification_logs order by "createdAt" desc limit 3;
   ```
   L'IP doit être **votre adresse publique**. Si elle appartient à Render (10.x, 100.x…), augmentez `TRUST_PROXY_HOPS` d'un cran ; si une IP falsifiée (`curl -H "X-Forwarded-For: 6.6.6.6" …`) apparaît, diminuez-le.
4. **Connexion** avec le compte administrateur créé à l'étape 1, puis changement du mot de passe provisoire.
5. **Pièce jointe et PDF** : déclarer une naissance de test, joindre une pièce, éditer un acte. Vérifiez ensuite qu'ils sont toujours lisibles après un redéploiement, ce qui confirme que le disque persistant fonctionne.

## 4. Domaine définitif

L'adresse `APP_PUBLIC_URL` est **imprimée dans le QR code de chaque acte**. Fixez le domaine définitif dans Render (**Settings › Custom Domains**) et dans `render.yaml` **avant de dresser le premier acte réel** : les QR codes déjà imprimés ne se mettent pas à jour.

## Points de fonctionnement

- **Migrations** : appliquées automatiquement au démarrage de l'API (`prisma migrate deploy`, via `DIRECT_URL`). Une migration commitée sur `main` part donc en production au prochain déploiement.
- **Disque** : un service avec disque ne tourne qu'en une seule instance, et chaque redéploiement provoque une courte coupure. Les fichiers du disque ne sont **pas** sauvegardés par Supabase : prévoyez une sauvegarde (instantanés Render, ou export régulier).
- **Sauvegarde de la base** : elle relève de l'offre Supabase (sauvegardes quotidiennes ; restauration à un instant donné en option).
- **Tâche planifiée** : le verrouillage des déclarations après 7 jours tourne toutes les heures dans l'API. L'offre *Starter* ne met pas le service en veille.
- **Limitation de débit** : en local et sur serveur, Nginx ajoutait une limite sur `/api/auth/login` et `/api/verification`. Sur Render, seule celle de l'API s'applique (10 tentatives de connexion par minute et par IP), en plus du blocage d'un compte après 5 échecs.
