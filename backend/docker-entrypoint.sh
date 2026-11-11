#!/bin/sh
# Applique les migrations Prisma, puis demarre l'API.
#
# La base peut refuser les connexions quelques secondes apres avoir ete declaree
# disponible (« FATAL: the database system is starting up » : PostgreSQL termine
# sa reprise alors que pg_isready repond deja). Sans nouvelle tentative, le
# conteneur sortait en erreur et ne devait son demarrage qu'a la politique de
# redemarrage ; chez un hebergeur, c'est un deploiement en echec. On retente donc
# un nombre borne de fois avant d'abandonner.
#
# `migrate deploy` n'applique que les migrations en attente et ne reinitialise
# jamais la base : le rejouer est sans effet.
# Attente progressive, plafonnee : quelques secondes suffisent a une reprise de
# PostgreSQL, mais une coupure reseau ou un reveil d'instance hebergee dure plus
# longtemps. Le budget par defaut couvre environ quatre minutes, apres quoi on
# abandonne : une adresse de base erronee doit echouer visiblement, pas boucler.
set -eu

tentatives="${MIGRATION_TENTATIVES:-20}"
attente="${MIGRATION_ATTENTE_S:-2}"
attente_max="${MIGRATION_ATTENTE_MAX_S:-15}"
n=1

while true; do
  if npx prisma migrate deploy; then
    break
  fi
  if [ "$n" -ge "$tentatives" ]; then
    echo "Migrations impossibles apres $n tentative(s) : arret." >&2
    exit 1
  fi
  echo "Base indisponible (tentative $n/$tentatives) : nouvel essai dans ${attente}s." >&2
  n=$((n + 1))
  sleep "$attente"
  attente=$((attente * 2))
  if [ "$attente" -gt "$attente_max" ]; then
    attente="$attente_max"
  fi
done

# exec : node devient PID 1 sous tini et recoit directement SIGTERM
exec node dist/main.js
