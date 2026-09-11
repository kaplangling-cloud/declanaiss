#!/bin/sh
# Restauration d'une sauvegarde produite par backup.sh
#   sh restore.sh /backups/declanaiss-YYYYMMDD-HHMMSS.tar.gpg
# Necessite : gpg (cle privee ou passphrase), pg_restore, acces a PG (PGHOST...).
set -eu
ARCHIVE="${1:?archive .tar.gpg requise}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

gpg --batch --yes -o "$TMP/archive.tar" -d "$ARCHIVE"
tar -C "$TMP" -xf "$TMP/archive.tar"
( cd "$TMP" && sha256sum -c SHA256SUMS )

echo "Restauration de la base (les objets existants sont remplaces)"
pg_restore --clean --if-exists --no-owner --dbname="${PGDATABASE:?}" "$TMP/db.dump"

echo "Restauration du stockage dans /var/lib/declanaiss"
mkdir -p /var/lib/declanaiss
tar -C /var/lib/declanaiss -xzf "$TMP/storage.tgz"
echo "Termine."
