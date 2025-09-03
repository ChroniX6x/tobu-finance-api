# Copilot Instructions for tobu-finance-api

## Project Overview
- **tobu-finance-api** is a TypeScript/Node.js backend for finance management, using a modular structure and MongoDB for persistence.
- Main entry: `src/server.ts` (Express server setup).
- Data access: `src/db.ts` (MongoDB connection and helpers).
- API routes: `src/routes/` (REST endpoints, grouped by domain).
- Models: `src/models/` (Mongoose schemas for core entities).
- Migrations: `src/migrations/` and `scripts/` (database schema evolution and seeding).
- Validation: `src/validation/` (Joi schemas for request validation).
- API docs: `docs/openapi.yaml` and `src/docs/swagger.ts` (OpenAPI spec and Swagger integration).

## Developer Workflows
- **Start server:** `npm start` or run `src/server.ts` directly.
- **Run migrations:** Use scripts in `scripts/` (e.g., `new-migration.ts`, `seed.ts`).
- **Debug:** Attach to Node.js process or use VS Code launch configs (if present).
- **Test:** No test folder detected; add tests in `src/` or follow project conventions if/when present.
- **Database:** MongoDB required; see `src/db.ts` for connection details.

## Project-Specific Patterns
- **Routes:** Each domain (e.g., accounts, transactions) has its own file in `src/routes/` and corresponding validation in `src/validation/`.
- **Models:** Mongoose schemas in `src/models/` match route/validation structure.
- **Migrations:** Timestamped migration files in `src/migrations/` and scripts in `scripts/` for DB changes.
- **Validation:** Joi schemas per route in `src/validation/`.
- **Error Handling:** Centralized middleware in `src/middleware/error.ts`.
- **Swagger:** API documentation via OpenAPI spec and Swagger UI integration.

## Integration Points
- **MongoDB:** All persistent data flows through Mongoose models in `src/models/`.
- **Express:** API endpoints defined in `src/routes/`, using validation and error middleware.
- **Swagger/OpenAPI:** API docs in `docs/openapi.yaml`, served via `src/docs/swagger.ts`.

## Conventions & Tips
- Keep route/model/validation naming consistent for each domain.
- Use migration scripts for DB changes; do not edit schemas directly without a migration.
- Validate all incoming requests using Joi schemas.
- Update OpenAPI spec when changing API endpoints.
- Use centralized error handling for all route errors.

## Key Files & Directories
- `src/server.ts` – Express server entry point
- `src/db.ts` – MongoDB connection
- `src/routes/` – API endpoints
- `src/models/` – Mongoose schemas
- `src/validation/` – Joi validation schemas
- `src/middleware/error.ts` – Error handling middleware
- `docs/openapi.yaml` – OpenAPI spec
- `src/docs/swagger.ts` – Swagger UI integration
- `scripts/` – Migration and seed scripts

---
_Review and update these instructions as the project evolves. Feedback on unclear or missing sections is welcome._
