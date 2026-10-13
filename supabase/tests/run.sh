#!/usr/bin/env bash
# Applies every migration to a scratch database and runs the RLS test suite.
# Requires a local PostgreSQL server; never touches a hosted project.
set -euo pipefail

DB="${QUILL_TEST_DB:-quill_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

dropdb --if-exists "$DB"
createdb "$DB"

PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB")

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_harness.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo
"${PSQL[@]}" -f "$ROOT/supabase/tests/01_rls.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/02_inventory.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/03_sales.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/04_parties.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/05_purchases.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/06_money.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/07_returns.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/08_audit.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/09_fiscal.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/10_storage.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/11_accounts.sql"
