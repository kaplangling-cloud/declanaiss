#!/bin/sh
# =====================================================================
#  Sauvegarde chiffree quotidienne : base PostgreSQL + stockage (PDF, pieces)
#  - Chiffrement GPG asymetrique (BACKUP_GPG_RECIPIENT) : la cle privee
#    n'est PAS sur le serveur ; sans destinataire, chiffrement symetrique
#    avec BACKUP_PASSPHRASE.
#  - Retention : BACKUP_RETENTION_DAYS (defaut 3650 j = 10 ans, valeur
#    legale minimale recommandee pour des actes d'etat civil).
#  - Les sauvegardes doivent etre copiees hors site (rsync/rclone) : ce
#    script ne fait que produire les archives dans /backups.
# =====================================================================
set -eu

DEST="${BACKUP_DEST:-/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-3650}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DEST"

echo "[$STAMP] dump PostgreSQL"
pg_dump --format=custom --compress=6 --file="$TMP/db.dump"

echo "[$STAMP] archive du stockage"
tar -C /var/lib/declanaiss -czf "$TMP/storage.tgz" storage 2>/dev/null || tar -czf "$TMP/storage.tgz" --files-from /dev/null

echo "[$STAMP] empreintes"
( cd "$TMP" && sha256sum db.dump storage.tgz > SHA256SUMS )

ARCHIVE="$TMP/declanaiss-$STAMP.tar"
tar -C "$TMP" -cf "$ARCHIVE" db.dump storage.tgz SHA256SUMS

echo "[$STAMP] chiffrement"
if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$DEST/declanaiss-$STAMP.tar.gpg" -e "$ARCHIVE"
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" --pinentry-mode loopback -o "$DEST/declanaiss-$STAMP.tar.gpg" -c "$ARCHIVE"
else
  echo "ERREUR : definir BACKUP_GPG_RECIPIENT ou BACKUP_PASSPHRASE (sauvegarde en clair refusee)" >&2
  exit 1
fi

echo "[$STAMP] rotation (> $RETENTION jours)"
find "$DEST" -name 'declanaiss-*.tar.gpg' -mtime "+$RETENTION" -delete

echo "[$STAMP] OK -> $DEST/declanaiss-$STAMP.tar.gpg ($(du -h "$DEST/declanaiss-$STAMP.tar.gpg" | cut -f1))"
