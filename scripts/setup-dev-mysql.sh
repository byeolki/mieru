#!/usr/bin/env bash
# Installs a project-local MySQL 8.4 under .tmp/mysql for development and integration tests.
# Homebrew is avoided on purpose: its portable Ruby hangs on this machine (see docs/plans/mieru.report.md).
set -euo pipefail

MYSQL_VERSION="${MYSQL_VERSION:-8.4.9}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/.tmp/mysql"
ARCHIVE="mysql-${MYSQL_VERSION}-macos15-arm64"

if [ -x "$TARGET/bin/mysqld" ]; then
  echo "MySQL already installed at $TARGET"
  exit 0
fi

mkdir -p "$ROOT/.tmp"
curl -sSfL -o "$ROOT/.tmp/mysql.tar.gz" "https://cdn.mysql.com/Downloads/MySQL-8.4/${ARCHIVE}.tar.gz"
tar -xzf "$ROOT/.tmp/mysql.tar.gz" -C "$ROOT/.tmp"
mv "$ROOT/.tmp/${ARCHIVE}" "$TARGET"
rm "$ROOT/.tmp/mysql.tar.gz"
"$TARGET/bin/mysqld" --version
