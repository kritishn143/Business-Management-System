# BMS

Live demo: https://businessms.vercel.app/

A business management and point-of-sale application for a stationery shop:
inventory, sales, purchases, customers and suppliers, money, and reports.

Built web-first. The database is the authority — money and stock are ledgers of
events, not quantities to overwrite, and every transaction that touches both
goes through a single PostgreSQL function so it either happens completely or
not at all.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: PostgreSQL, Auth, Storage, Row Level Security
- Vitest for unit tests, plain SQL for database tests

## Getting started

```bash
npm install
cp .env.example .env    # then fill in your Supabase project's values
npm run dev
```

Required environment variables (see `.env.example`):

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server |

`SUPABASE_DB_PASSWORD` is only needed locally, for pushing migrations. Never add
a service-role key to a `NEXT_PUBLIC_` variable.

## Database

Schema changes are migrations under `supabase/migrations/`, applied in filename
order. Nothing is ever changed by hand in a hosted project.

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (Vitest) |
| `npm run db:test` | applies every migration to a scratch database and runs the SQL suite |

`npm run db:test` needs a local PostgreSQL server. It creates and drops its own
database and never touches a hosted project.

## Tests

- **Unit** — money arithmetic, sale and profit calculations, stock, receivables
  ageing, CSV import and export, the offline sync queue, and invoice rendering.
- **Database** — tenant isolation, permissions per role, transaction atomicity,
  idempotency, ledger immutability, the audit trail, closed-period locking, and
  storage path isolation.

Both suites run without network access or credentials.

## Security

`SECURITY.md` records what has been verified, how to verify it again, and what is
still unproven. Read it before deploying, and keep it current.

## Notes

- Amounts are `numeric` in the database and integer minor units in TypeScript.
  Never floating point.
- Timestamps are stored in UTC; the shop's timezone and calendar (AD or Bikram
  Sambat) decide only how they are shown.
- Sales taken while offline are queued on the device and synced later, each
  carrying an idempotency key so a retry cannot record a sale twice.
