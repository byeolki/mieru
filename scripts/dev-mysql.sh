#!/usr/bin/env bash
# Runs the project-local MySQL in the foreground (used by the Paseo "mysql" service script).
# Binds to 127.0.0.1 only; data lives in .tmp/mysql-data and is never committed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MYSQL="$ROOT/.tmp/mysql"
DATA="$ROOT/.tmp/mysql-data"
PORT="${MYSQL_PORT:-3306}"

if [ ! -x "$MYSQL/bin/mysqld" ]; then
  echo "MySQL is missing; run scripts/setup-dev-mysql.sh first" >&2
  exit 1
fi

if [ ! -d "$DATA/mysql" ]; then
  mkdir -p "$DATA"
  "$MYSQL/bin/mysqld" --no-defaults --initialize-insecure --user="$(whoami)" \
    --basedir="$MYSQL" --datadir="$DATA"
fi

exec "$MYSQL/bin/mysqld" --no-defaults --basedir="$MYSQL" --datadir="$DATA" \
  --bind-address=127.0.0.1 --port="$PORT" --mysqlx=OFF \
  --socket="$ROOT/.tmp/mysql.sock" --pid-file="$ROOT/.tmp/mysql.pid" \
  --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci \
  --default-time-zone=+00:00 --innodb-buffer-pool-size=256M \
  --log-error="$ROOT/.tmp/mysql-error.log"
