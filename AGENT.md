# EV Charging Solutions Backend: Developer Guide

## Tech Stack

- **Runtime:** Node.js (JavaScript)
- **Framework:** Express
- **Database:** Supabase PostgreSQL through Prisma (schema split across `prisma/*.prisma`)
- **Files:** Cloudflare R2 (private buckets, signed links from this server)
- **Real-time:** Socket.IO
- **Routing:** express-group-routes

The mobile app talks only to this server, never to Supabase or R2 directly.
Use Supabase as a plain Postgres database: no business rules in Row Level
Security policies, Supabase-only triggers or Edge Functions. Every schema
change is a Prisma migration.

---

## Directory Structure

```
EvChargingBackend/
├── server.js                      # Entry point: checks the database, starts HTTP + Socket.IO
├── bootstrap/
│   ├── app.js                     # Express setup (headers, logging, JSON, routes, errors)
│   └── autoload.js                # Loads bootstrap/app.js
├── prisma/
│   └── schema.prisma              # Generator + datasource; models go in prisma/<area>.prisma
├── config/
│   ├── app.js                     # Name, port, env, app key
│   ├── constants.js               # App-wide constants
│   ├── database.js                # Shared PrismaClient
│   └── storage.js                 # Cloudflare R2 settings
├── routes/
│   ├── api.js                     # REST routes, mounted at /api/v1
│   └── socket.js                  # Socket.IO event handlers
└── app/
    ├── Http/Controllers/v1/       # One controller per resource
    ├── Traits/ApiResponser.js     # Standard response format
    └── Exceptions/Handler.js      # 404 and error handling
```

---

## Code Style

| Rule | Convention |
|---|---|
| Indentation | 2 spaces |
| Quotes | Single quotes |
| Semicolons | Always |
| Strict mode | `'use strict'` at top of every file |
| Variables | camelCase |
| Constants | SCREAMING_SNAKE_CASE |
| Models / Classes | PascalCase |
| Export pattern | `let o = {}` → attach methods → `module.exports = o` |

---

## Patterns to Follow

### Controller
```js
'use strict'

let json = require('../../../Traits/ApiResponser');

let o = {}

o.index = async (req, res, next) => {
  try {
    // logic here
    json.successResponse(res, data)
  } catch (e) {
    next(e)
  }
}

module.exports = o;
```

### Route File
```js
'use strict'

const express = require('express');
require('express-group-routes');

const authCtrl = require('../app/Http/Controllers/v1/AuthController');
const resourceCtrl = require('../app/Http/Controllers/v1/ResourceController');

const app = express.Router();

app.group("/resource", (Route) => {
  Route.get("/", authCtrl.authenticate, resourceCtrl.index);
  Route.post("/", authCtrl.authenticate, resourceCtrl.store);
  Route.put("/:id", authCtrl.authenticate, resourceCtrl.update);
  Route.delete("/:id", authCtrl.authenticate, resourceCtrl.destroy);
});

module.exports = app;
```

### Model (Prisma)
Models are defined in `prisma/*.prisma`, not in code. Add the model to the
relevant domain file, then regenerate the client and create a migration:
```prisma
model Resource {
  id        String   @id @default(uuid())
  name      String
  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```
```bash
npx prisma migrate dev --name add_resource   # creates + applies a migration
npx prisma generate                          # regenerates the client
```

### Data Access
Use the shared PrismaClient from `config/database.js`:
```js
const prisma = require('../../../../config/database');
const resource = await prisma.resource.findUnique({ where: { id } });
```

### Section Comments
```js
/*
|--------------------------------------------------------------------------
| Section Name
|--------------------------------------------------------------------------
| Brief description of what this section does.
|
*/
```

---

## Response Format

All responses go through `app/Traits/ApiResponser.js`:

```js
json.successResponse(res, data)              // 200 -> { data: ... }
json.successResponse(res, data, 201)         // 201 -> { data: ... }
json.errorResponse(res, 'Not found', 404)    // -> { error: '...', code: 404 }
```

---

## Adding a New Resource

1. **Model**: add it to the relevant `prisma/*.prisma` file, then run
   `npx prisma migrate dev --name <change>`
2. **Controller**: `app/Http/Controllers/v1/ResourceController.js`
3. **Routes**: add a group to `routes/api.js`

---

## Environment Variables

Copy `.env-example` to `.env` and fill in the values. `.env` is never committed.

---

## Running the Project

```bash
npm install
cp .env-example .env       # fill in DATABASE_URL and the R2 values
npx prisma generate        # generate the Prisma client
npm run dev                # restarts on file changes
```

Check it works: `GET http://localhost:8000/api/v1/health` returns
`{ "data": { "status": "ok", "database": "connected" } }`.
