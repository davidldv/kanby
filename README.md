# Kanby is a collaborative Kanban board with realtime updates, an append-only activity log, and per-card undo

## Getting Started

### 1) Configure environment variables

- Copy `.env.example` → `.env.local`
- Set `MIGRATE_DATABASE_URL` and `RUNTIME_DATABASE_URL`

Supabase tips:

- Use a **direct connection** or **session pooler** for `MIGRATE_DATABASE_URL` (Prisma needs this for `db push` / migrations)
- Use a **transaction pooler** for `RUNTIME_DATABASE_URL` (serverless-friendly)
- Hosted Postgres typically requires `sslmode=require`
- Poolers typically require `pgbouncer=true`

### 2) Create tables and generate client

```bash
bun run prisma:generate
bun run db:push
```

First, run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Common issues

- If the UI shows errors like "The table `public.Board` does not exist": you haven't run `bun run db:push` yet.
- If Prisma cannot reach `db.<ref>.supabase.co:5432` and your machine has no IPv6 route: use the **session pooler** host/port for `MIGRATE_DATABASE_URL` instead.
