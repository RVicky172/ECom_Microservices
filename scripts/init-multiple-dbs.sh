#!/bin/bash
# Creates multiple PostgreSQL databases from POSTGRES_MULTIPLE_DATABASES env var
# Used as a docker-entrypoint-initdb.d script

set -e
set -u

function create_user_and_database() {
  local database=$1
  case "$database" in
    ''|*[!a-zA-Z0-9_]*|[0-9]*)
      echo "Invalid database name: '$database'" >&2
      exit 1
      ;;
  esac

  echo "  Creating database '$database'"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --set=db_name="$database" --set=db_owner="$POSTGRES_USER" <<-'EOSQL'
    CREATE DATABASE :"db_name";
    GRANT ALL PRIVILEGES ON DATABASE :"db_name" TO :"db_owner";
EOSQL
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  echo "Multiple database creation requested: $POSTGRES_MULTIPLE_DATABASES"
  for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
    create_user_and_database $db
  done
  echo "Multiple databases created"
fi
