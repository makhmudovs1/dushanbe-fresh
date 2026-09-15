# Dushanbe Fresh

MVP skeleton for a fresh grocery delivery service from local markets in
Dushanbe.

## Stack

- pnpm monorepo
- Next.js + TypeScript in `apps/web`
- NestJS + TypeScript in `apps/api`
- Shared TypeScript package in `packages/shared`
- PostgreSQL
- Prisma
- Docker Compose for local PostgreSQL

Catalog browsing and basic catalog administration are implemented. Cart,
checkout, customer auth, SMS, payments, delivery waves, and order management are
intentionally not implemented yet.

## Prerequisites

- Node.js 18.16+ or newer
- Docker Desktop or Docker daemon
- Corepack

This repository pins pnpm through `packageManager`, so a global pnpm install is
not required.

## Local Setup

Install dependencies:

```bash
corepack pnpm install
```

Generate Prisma Client:

```bash
corepack pnpm db:generate
```

Run the project locally:

```bash
corepack pnpm dev
```

That command starts PostgreSQL through Docker Compose and runs:

- web app on `http://localhost:3000`
- API on `http://localhost:4000`

Health endpoint:

```bash
curl http://localhost:4000/api/v1/health
```

Admin route:

```text
http://localhost:3000/admin
```

Catalog route:

```text
http://localhost:3000/catalog
```

Product page example:

```text
http://localhost:3000/products/tomatoes
```

## Database

The local default database URL is:

```text
postgresql://dushanbe_fresh:dushanbe_fresh@localhost:5432/dushanbe_fresh?schema=public
```

Apply development migrations:

```bash
corepack pnpm db:migrate
```

Seed the local catalog:

```bash
corepack pnpm db:seed
```

Apply migrations in deployed environments:

```bash
corepack pnpm db:deploy
```

Override `DATABASE_URL` when needed:

```bash
DATABASE_URL="postgresql://user:password@host:5432/database?schema=public" corepack pnpm db:deploy
```

## API Endpoints

Public catalog:

```text
GET /api/v1/categories
GET /api/v1/products
GET /api/v1/products?category=vegetables
GET /api/v1/products?search=помидоры
GET /api/v1/products/:slug
```

Admin catalog:

```text
GET /api/v1/admin/categories
POST /api/v1/admin/categories
PATCH /api/v1/admin/categories/:id
GET /api/v1/admin/products
POST /api/v1/admin/products
PATCH /api/v1/admin/products/:id
```

Admin API is currently open for local development because authentication has not
been implemented yet. This is a TODO and is not production-ready security.

## Checks

Run lint:

```bash
corepack pnpm lint
```

Run TypeScript checks:

```bash
corepack pnpm typecheck
```

Run tests:

```bash
corepack pnpm test
```

Build web:

```bash
corepack pnpm build:web
```

Build API:

```bash
corepack pnpm build:api
```

Build all packages:

```bash
corepack pnpm build
```
