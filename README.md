# EV Charging Solutions Backend

Express API for the EV Charging Solutions mobile app, on Supabase PostgreSQL
(through Prisma) with Cloudflare R2 for photos.

## Setup

```bash
npm install
cp .env-example .env       # fill in DATABASE_URL and the R2 values
npx prisma generate
npm run dev
```

Health check: `GET http://localhost:8000/api/v1/health`

See `AGENT.md` for structure, conventions and how to add a resource.
