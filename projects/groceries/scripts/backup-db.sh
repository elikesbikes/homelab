#!/usr/bin/env bash
# Creates a timestamped snapshot of pb_data before schema changes or migrations.
# Usage: ./scripts/backup-db.sh
# Run from the project root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="$PROJECT_DIR/pb_data"
DEST="$PROJECT_DIR/pb_data.backup.$(date +%Y%m%d_%H%M%S)"

if [ ! -d "$SRC" ]; then
  echo "ERROR: pb_data not found at $SRC" >&2
  exit 1
fi

cp -r "$SRC" "$DEST"
echo "Backup created: $DEST"
du -sh "$DEST"
