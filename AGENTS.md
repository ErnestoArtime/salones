# Lavía

Use codebase-memory-mcp for code discovery; index this repository before graph queries if needed. Use `rtk` when installed. In this VPS `rtk` was unavailable during the initial implementation; do not assume it exists.

Read README.md and docs/architecture.md before changing business behavior. Do not modify other projects or shared infrastructure on this VPS. Do not print .env, .local/demo.json, backup contents or authentication traces: they contain secrets.

Run `pnpm run build` for TypeScript and Angular template validation. Integration tests use the running local Compose deployment; browser tests also require `pnpm run seed`. Read docs/operations.md before touching persistent volumes. Never rewrite applied migrations or run `docker compose down -v` against a populated deployment.

Keep tenant identity and roles server-derived. The API runtime role must never become owner/superuser/BYPASSRLS. Public booking code must only use its slug-scoped transaction context. Preserve transactional locking and the PostgreSQL exclusion constraint when changing availability.

Visual system: tokens.css, Fraunces + IBM Plex Sans served locally, warm paper and plum. Use the existing shared tokens. Angular production must keep inlineCritical=false: the strict CSP intentionally blocks inline scripts and their generated CSS onload handlers.
