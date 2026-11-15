# Role-based JWT authentication service

A TypeScript/Express authentication service with a responsive browser-based sign-in experience, persistent local SQLite storage for out-of-the-box development, optional PostgreSQL deployment, bcrypt password hashing, signed JWT access tokens, and `USER`/`ADMIN` authorization.

## Requirements and setup

- Node.js 20 or newer

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Before starting, change `JWT_SECRET` in `.env` to a unique random value of at least 32 characters. The default `DATABASE_URL=file:./data/role-auth.db` creates a persistent local database automatically; it requires no separate database installation or migration. The `data` directory is ignored by git.

Open [http://localhost:3000](http://localhost:3000) to register an account or sign in. New registrations always receive the `USER` role. To bootstrap an admin, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (the password must be 12–72 UTF-8 bytes) and run `npm run admin:bootstrap`. Bootstrap does not change an existing user's password or role.

### PostgreSQL deployment

For PostgreSQL, set `DATABASE_URL` to a PostgreSQL connection URL, then run `npx prisma generate` and `npm run db:migrate` during development (`npm run db:deploy` for deployment). `docker compose up -d postgres` starts the included PostgreSQL 16 service if Docker is installed. For production, use a managed PostgreSQL instance and a secret manager; set `NODE_ENV=production`, run `npm run db:deploy`, then `npm run build` and `npm start`. Do not use the example secret or credentials.

### Deploy to Vercel

Import this GitHub repository into Vercel and set the **Root Directory** to the repository root. `vercel.json` sends `/auth/*`, `/admin`, and `/health` to the serverless API while Vercel serves the frontend and assets from `public/`.

Configure these Vercel environment variables for **Production** and **Preview** before deploying:

- `NODE_ENV=production`
- `JWT_SECRET` — a unique random value of at least 32 characters
- `DATABASE_URL` — a persistent hosted PostgreSQL URL or a Turso/libSQL URL (`libsql://...`); do not use `file:...` on Vercel because serverless files are ephemeral
- `LIBSQL_AUTH_TOKEN` — required when using a hosted Turso/libSQL database

Vercel automatically runs the `vercel-build` script. After configuring the variables, redeploy from Vercel. To give an admin role, configure `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and run the bootstrap command against the same hosted database before inviting users. Vercel hosting does not create or provision a database for the app.

If registration or sign-in reports that the authentication database is unavailable, verify the `DATABASE_URL` in the environment used to launch the server. PostgreSQL must be running and migrated when using a PostgreSQL URL. The local SQLite database is initialized automatically.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `file:./data/role-auth.db` in `.env.example` | Local SQLite file URL or PostgreSQL connection URL |
| `JWT_SECRET` | Yes | — | HMAC secret; at least 32 characters |
| `JWT_EXPIRES_IN` | No | `15m` | Access-token lifetime (`s`, `m`, `h`, or `d`), capped at 7 days |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt work factor, accepted range 10–14 |
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `ADMIN_EMAIL` | For bootstrap | — | Initial admin email |
| `ADMIN_PASSWORD` | For bootstrap | — | Initial admin password, at least 12 characters |

## Browser app

Open `http://localhost:3000/` after starting the service. The responsive interface supports registration and sign-in, displays the current account and role, and shows the admin workspace control only to admins. Access tokens stay in memory and are cleared when the page is reloaded or the user signs out.

## API

All request and response bodies use JSON.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Liveness response |
| `POST` | `/auth/register` | Public | Create a `USER`; body: `{"email":"user@example.com","password":"at-least-12-characters"}` |
| `POST` | `/auth/login` | Public | Verify credentials; body: `{"email":"user@example.com","password":"..."}` |
| `GET` | `/auth/me` | Bearer token | Return the authenticated user's profile |
| `GET` | `/admin` | `ADMIN` bearer token | Example protected admin endpoint |

Registration and login return `{ "token": "...", "user": { "id": "...", "email": "...", "role": "...", "createdAt": "..." } }`. Public registration rejects extra fields such as `role`.

## Tests

```powershell
npm test
npm run typecheck
npm run build
```

The tests exercise the HTTP/authentication behavior with an in-memory repository and an embedded SQLite database; they do not require a separate database server. The Prisma schema and migration define PostgreSQL persistence.

## Security scope and limitations

Passwords are stored as bcrypt hashes and are not included in API responses. Registration enforces a 12-character minimum, rejects passwords longer than bcrypt's 72-byte input limit, and does not permit role selection. JWT verification restricts the algorithm to HS256 and checks issuer, audience, and expiration; token lifetime is capped at seven days. Login failures use a generic response.

This service does not implement refresh tokens, token revocation, email verification, password reset, rate limiting, account lockout, or TLS termination. A role embedded in an issued JWT remains effective until that token expires. Deploy behind HTTPS, protect secrets, and add operational controls appropriate to the deployment; this implementation alone is not a complete security assurance.
