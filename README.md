# Radbit Auto

Multi-tenant operations platform for Zimbabwean vehicle import and dealership businesses. Replaces WhatsApp threads and paper files with one system of record: where a vehicle is, what stage it is at, what the customer owes, and who is responsible.

## Modules

**Import lifecycle.** Sourcing, shipping, arrival, clearance, preparation and handover, tracked per case with document upload, status history and customer-visible progress. Tenants are sourcing businesses and clearing agents, each with their own branding, staff, customers and workflow configuration.

**Dealership.** Tenant-scoped leads, owned and consigned stock, reservations, retail sales and handover. Reservations are enforced by a server transaction so two customers cannot hold the same vehicle. Public showroom pages per agency slug expose listing data while excluding costs, VINs, buyer identities and sale references.

**Money.** All values are integer USD cents. Payments and refunds carry evidence references, repeated payment requests are idempotent through request keys, and financial actions are recorded immutably. Sale agreements, balance statements and receipts are numbered and immutable once issued.

**Access control.** Customer, staff and administrator roles, scoped per tenant and enforced at the database layer through row-level security policies rather than in the client.

## Architecture

| Layer | Technology |
| --- | --- |
| Web client | React, TypeScript, Vite (Node 20) |
| Data | Postgres with row-level security and RPC functions (`db/`) |
| Auth | Firebase, with a documented migration path in `db/FIREBASE_MIGRATION_PLAN.md` |
| Tests | Playwright end-to-end suites in `web/e2e` |
| Hosting | Vercel (web), Render for the API |

```
db/          schema, seed data, RLS policies, RPC functions
web/         React application, e2e suites, release evidence
firebase/    Firebase configuration
guidebook/   operating guide
```

## Run locally

```bash
cd web
npm install
npm run dev        # Vite dev server
npm run typecheck
npm run test:e2e   # Playwright
npm run build
```

Database setup order: `0001_schema.sql`, `0002_seed_defaults.sql`, `0003_rls_policies.sql`, `0004_functions_rpc.sql`.

## Documentation

The root directory is the working record for this project. Start with `SPEC.md` (consolidated specification, including the conflict resolution register), then:

- `PRD.txt` product requirements
- `DEALERSHIP_RELEASE.md` dealership module scope and implemented workflows
- `ENQUIRY_WORKFLOW_RELEASE.md`, `RADBIT_AUTO_ENGINE_RELEASE.md`, `RADBIT_BEFORWARD_INVENTORY_RELEASE.md`, `SUBSCRIPTION_RELEASE.md` module releases
- `PRODUCTION_READINESS.md` current readiness and outstanding gates
- `OPERATIONS_RUNBOOK.md` operational procedures
- `COMMERCIAL_AUDIT.md` commercial model
- `POTRAZ_COMPLIANCE_ASSESSMENT.md`, `AGENCY_DATA_PROCESSING_AGREEMENT.md`, `DPO_ENGAGEMENT_BRIEF.md` compliance position
- `CLIENT_ONBOARDING.md`, `DEALERSHIP_JOURNEYS.md`, `DEALERSHIP_VALIDATION.md` onboarding and validation
- `NEXUS_RADBIT_AUTHORITY_RESOLUTION.md`, `RADBIT_IP_OWNERSHIP_NOTE.md` ownership boundaries

## Status

Tenant deployments are configured per client. This repository contains no customer data, credentials or production keys; configuration is supplied through environment variables. Read `PRODUCTION_READINESS.md` before treating any module as production ready.

## Author

Tinotenda Brandon Duma, Radbit Studios. Contact: brandontinoz@gmail.com
