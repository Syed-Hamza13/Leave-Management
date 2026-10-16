# Leave Management

An authentication foundation and planned configurable leave-management platform.

## Project status

The repository currently contains a React/Vite client, an Express API, MySQL-backed
users and session/device registry, Redis-backed sessions/rate limits, and a basic
authenticated dashboard. The configurable field, form, table, mapping, organization,
and user-administration features are planned; they are not implemented yet.

## Documentation

See [docs/PROJECT-GUIDE.md](./docs/PROJECT-GUIDE.md) for:

- Current frontend/backend architecture and authentication flow
- The proposed metadata-driven product/data model
- Reusable UI and API/module structure
- A phased implementation roadmap, indicative effort, and MVP acceptance gates
- Security, authorization, schema lifecycle, testing, and operational gaps

## Local development

The server needs MySQL and Redis, plus values configured from `server/.env.example`.
Run migrations and start the API from `server/`:

```powershell
npm run migrate
npm run dev
```

Start the client from `client/`:

```powershell
npm run dev
```

For the complete setup and available validation commands, see the project guide.
Never commit local environment files or real credentials.