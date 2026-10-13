#!/usr/bin/env bash
# =====================================================================
#  Prepare la base Supabase depuis ce poste (une seule fois, avant le
#  premier deploiement Render) :
#    1. applique les migrations Prisma ;
#    2. importe le decoupage administratif (10 regions, 58 departements,
#       360 arrondissements) ;
#    3. cree le premier administrateur national (si ADMIN_EMAIL et
#       ADMIN_USERNAME sont renseignes ; mot de passe provisoire affiche une fois).
#
#  Usage (depuis la racine du depot) : bash scripts/preparer-supabase.sh
#  Lit .env.supabase (non versionne) ; n'affiche jamais les adresses de connexion.
#  Chaque etape est idempotente, sauf la creation de l'administrateur (refusee
#  si le compte existe deja).
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.supabase ]; then
  echo "Fichier .env.supabase absent : le creer depuis .env.supabase.example" >&2
  exit 1
fi
set -a; . ./.env.supabase; set +a
: "${DATABASE_URL:?DATABASE_URL manquant dans .env.supabase}"
: "${DIRECT_URL:?DIRECT_URL manquant dans .env.supabase}"
case "$DATABASE_URL" in *supabase*) ;; *) echo "DATABASE_URL ne designe pas Supabase : arret par prudence" >&2; exit 1 ;; esac

cd backend
echo "== 1/3 Migrations"
npx prisma migrate deploy
echo "== 2/3 Decoupage administratif"
npm run --silent import:decoupage
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_USERNAME:-}" ]; then
  echo "== 3/3 Administrateur national"
  npm run --silent admin:creer || echo "(administrateur non cree : voir le message ci-dessus)"
else
  echo "== 3/3 Administrateur : ADMIN_EMAIL / ADMIN_USERNAME non renseignes, etape ignoree"
fi
echo "Base Supabase prete."
