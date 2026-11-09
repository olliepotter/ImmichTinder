# ImmichTinder — Design & API Contract

This document is the contract shared by backend, frontend and deployment work.
Change it deliberately; every part of the app depends on it.

## Principles

1. **Never permanently delete.** Every Immich delete call sends `force: false`
   explicitly. No code path may send `force: true` or call `/api/trash/empty`.
2. **A failed Immich call changes nothing locally.** Review rows are written only
   after the Immich mutation succeeds; counters only move on success.
3. **The Immich API key never leaves the server.** No `runtimeConfig.public`
   secrets; images are proxied.
4. **Single user, password-protected**, with Tailscale as the network boundary.

## Configuration (server-side env, read via `useRuntimeConfig()`)

| Env var | Required | Purpose |
|---|---|---|
| `NUXT_IMMICH_URL` (alias `IMMICH_URL`) | yes | Immich base URL, no trailing slash, e.g. `http://immich-server:2283` |
| `NUXT_IMMICH_API_KEY` (alias `IMMICH_API_KEY`, legacy `IMMICH_TOKEN`) | yes | Immich API key |
| `NUXT_APP_PASSWORD` (alias `APP_PASSWORD`) | yes in production | Login password |
| `NUXT_SESSION_PASSWORD` (alias `SESSION_SECRET`) | yes in production | ≥32 chars, seals the session cookie |
| `NUXT_DATABASE_PATH` (alias `DATABASE_PATH`) | no | SQLite file, default `./data/immich-tinder.db` (`/data/immich-tinder.db` in Docker) |
| `NUXT_PUBLIC_IMMICH_WEB_URL` | no | Public Immich web URL for "Open in Immich" deep links (not a secret) |
| `NUXT_COOKIE_SECURE` | no | default `true` in production; set `false` for plain-HTTP LAN testing |

Minimum Immich API key permissions (verified against the OpenAPI spec, see below):
`asset.read`, `asset.view`, `asset.update`, `asset.delete`, `asset.statistics`,
`album.read`, `user.read`. Trash restore is covered by `asset.delete`.
`GET /api/server/version` needs no permission. `timeline.read` is not needed by
any call below.

## Immich API usage

Verified against the Immich OpenAPI spec of **v3.3.6** (latest stable release,
2026-11-04) and `main` (`3.4.0-rc.0`) on 2026-11-09; the same calls and fields
also exist in v2.7.5. Implemented in `server/utils/immich.ts`.

| Purpose | Call | Permission |
|---|---|---|
| Current user (scopes review history) | `GET /api/users/me` → `id` | `user.read` |
| Server version (health/diagnostics) | `GET /api/server/version` → `{ major, minor, patch, prerelease }` (`prerelease` since v3.0.0, nullable) | none |
| Albums | `GET /api/albums` → `{ id, albumName, assetCount, albumThumbnailAssetId: string\|null }[]` | `album.read` |
| Random candidates | `POST /api/search/random` `{ size, type: 'IMAGE', albumIds?, takenAfter?, takenBefore?, withExif: true }` → `AssetResponseDto[]` | `asset.read` |
| Ordered candidates | `POST /api/search/metadata` `{ page, size, order: 'asc'\|'desc', type: 'IMAGE', albumIds?, takenAfter?, takenBefore?, withExif: true }` → `assets.items`, `assets.nextPage` (string page number or `null`) | `asset.read` |
| Scope count | `POST /api/search/statistics` `{ type: 'IMAGE', albumIds?, takenAfter?, takenBefore? }` → `total` | `asset.statistics` |
| Asset details | `GET /api/assets/{id}` | `asset.read` |
| Preview image | `GET /api/assets/{id}/thumbnail?size=preview` (and `size=thumbnail`); binary body, image `Content-Type` | `asset.view` |
| Trash (recoverable) | `DELETE /api/assets` `{ ids: [id], force: false }` → 204 | `asset.delete` |
| Restore from trash | `POST /api/trash/restore/assets` `{ ids: [id] }` → `{ count }` | `asset.delete` |
| Favourite | `PUT /api/assets/{id}` `{ isFavorite: true\|false }` → `AssetResponseDto` | `asset.update` |

Notes from the spec check:

- `size` on `search/random` and `search/metadata` is 1–1000 (default 250).
- Since v3.2.0 the flat search fields (`type`, `albumIds`, `takenAfter`,
  `takenBefore`, `page`, `order`) and the `nextPage` response field are marked
  **deprecated** but still accepted. Their replacements are `filter`
  (`{ type: { eq: 'IMAGE' }, albumIds: { any: [...] }, takenAt: { gte, lt } }`),
  `orderBy: { field: 'fileCreatedAt'|'localDateTime'|..., direction: 'asc'|'desc' }`
  and `cursor` / `assets.nextCursor`. These exist only in v3.2.0+, so the client
  keeps the flat fields for v2.x/v3.x compatibility; migrate before they are removed.
- `search/metadata` responds `{ albums, assets: { items, count, total, facets, nextPage, nextCursor } }`;
  `assets.total` is deprecated since v3.0.0. Use `search/statistics` for counts.
- `force` on `DELETE /api/assets` is an optional boolean. The client always
  sends `force: false` explicitly and offers no way to send `true`.
- `PUT /api/assets/{id}` is marked deprecated in the v3.3.6 spec. On `main`
  the deprecation is lifted: PATCH is accepted since v3.0.0, becomes the default
  in v4, and PUT is dropped in v5. The client uses PUT because it works on v2.x
  and v3.x.

Trashed assets are excluded from search results by Immich by default.

## Data model (SQLite, `better-sqlite3`, WAL mode)

Migrations: numbered SQL in `server/database/migrations/NNN_name.ts` (each
default-exports its SQL string, so Nitro bundles it into `.output`; listed in
`migrations/index.ts`), applied at startup in a transaction, tracked in
`schema_migrations`.

```sql
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,          -- Immich user id
  asset_id TEXT NOT NULL,         -- Immich asset UUID
  status TEXT NOT NULL CHECK (status IN ('kept','trashed','favourited')),
  previous_is_favorite INTEGER,   -- for undo of 'favourited'
  reviewed_at TEXT NOT NULL,      -- ISO timestamp
  UNIQUE (user_id, asset_id)
);
CREATE INDEX reviews_user_status ON reviews(user_id, status);
CREATE INDEX reviews_user_time ON reviews(user_id, reviewed_at);

CREATE TABLE settings (           -- persisted UI scope etc.
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,            -- JSON
  PRIMARY KEY (user_id, key)
);
```

Undo = remove the user's most recent review row (by `reviewed_at`, then `id`)
after reverting its Immich side effect. Repeated undo walks further back.
Skipped photos are never written.

## Review scope

```ts
type ReviewScope = {
  albumId: string | null          // null = whole library
  order: 'random' | 'oldest' | 'newest'
  takenAfter: string | null       // ISO date (inclusive)
  takenBefore: string | null      // ISO date (exclusive)
}
```

## HTTP API (all JSON; all except `/api/auth/*` and `/api/health` require a session)

Errors use h3 `createError({ statusCode, statusMessage, data? })`. The UI shows
`statusMessage`. Asset ids and album ids are validated as UUIDs (400 otherwise).
Request bodies are validated with `zod`.

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/health` | — | `{ ok: true, db: 'ok', immich: 'ok'\|'unreachable', version?: string }` (200 even if Immich is down; 503 if DB down) |
| `POST /api/auth/login` | `{ password }` | `{ ok: true }` sets session cookie; 401 on wrong password; rate-limited (5/min/IP) |
| `POST /api/auth/logout` | — | `{ ok: true }` |
| `GET /api/auth/session` | — | `{ authenticated: boolean }` |
| `GET /api/albums` | — | `{ albums: { id, name, assetCount, thumbnailAssetId: string\|null }[] }` |
| `GET /api/scope` | — | `ReviewScope` (saved, or default `{ albumId: null, order: 'random', takenAfter: null, takenBefore: null }`) |
| `PUT /api/scope` | `ReviewScope` | `ReviewScope` |
| `GET /api/queue` | query: `ReviewScope` fields + `size` (1–50, default 10) + `exclude` (comma-separated ids already held by the client) + `page` (opaque cursor, ordered modes) | `{ items: QueueItem[], nextCursor: string\|null, exhausted: boolean }` — never returns reviewed or excluded assets |
| `POST /api/review` | `{ assetId, decision: 'keep'\|'trash'\|'favourite' }` | `{ review: Review, stats: Stats }`; 409 if already reviewed or a mutation for that asset is in flight; 502 if Immich failed (nothing recorded) |
| `POST /api/review/undo` | — | `{ undone: Review\|null, asset: QueueItem\|null, stats: Stats }`; 502 if the Immich revert failed (review row kept) |
| `GET /api/stats` | query: `ReviewScope` fields | `Stats` |
| `POST /api/review/reset` | `{ confirm: 'RESET' }` | `{ deleted: number }` — deletes review rows only, never touches Immich |
| `GET /api/assets/:id/image` | query `size=preview\|thumbnail` | image bytes, correct `Content-Type` from Immich, `Cache-Control: private, max-age=3600` |

For `GET /api/queue` and `GET /api/stats`, scope fields missing from the query
fall back to the saved scope; an empty value means `null`. The `stats` returned
by review/undo use the saved scope. Ordered queue modes page `search/metadata`
with `withDeleted: true` (trashed assets filtered server-side) so offsets stay
stable while photos are trashed.

```ts
type QueueItem = {
  id: string
  takenAt: string | null
  fileName: string | null
  isFavorite: boolean
  width: number | null
  height: number | null
  location: { text: string | null; city: string | null; state: string | null; country: string | null; latitude: number | null; longitude: number | null }
  camera: string | null           // "Make Model"
}

type Review = { assetId: string; status: 'kept' | 'trashed' | 'favourited'; reviewedAt: string }

type Stats = {
  total: number        // eligible in scope = remaining + reviewed-in-scope
  reviewed: number     // kept + trashed + favourited (each asset counted once)
  kept: number
  trashed: number
  favourited: number
  remaining: number    // un-reviewed, non-trashed images in scope from Immich
  percent: number      // reviewed / total * 100, 1 decimal, 0 when total is 0
}
```

### Stats computation

- `remaining` = Immich `search/statistics` total for the scope minus the number
  of kept/favourited review rows whose assets are still in that scope.
- Trashed assets are excluded from Immich's count, so `trashed` comes from the DB.
- Whole-library scope with no date filter: count all review rows for the user.
  Album/date scopes: intersect review rows with the scope's asset ids (fetched
  via `search/metadata` with `withDeleted: true` so trashed assets stay members,
  cached in memory for 5 minutes; a review of an asset missing from a cached set
  invalidates that set, and reset clears the cache).
- Reconciliation: review rows whose asset no longer exists in Immich (404) are
  ignored when encountered; restored/externally-untrashed assets that still have
  a `trashed` row stay excluded from the queue until history is reset.

### Concurrency

An in-memory per-asset lock wraps each review/undo mutation, plus a global undo
lock. The `UNIQUE(user_id, asset_id)` constraint is the backstop. The client
also disables actions while a request is pending.

## Frontend behaviour

| Input | Action |
|---|---|
| Swipe left / `←` / `D` | Trash |
| Swipe right / `→` / `K` | Keep |
| Swipe up / `↑` / `F` | Favourite |
| Swipe down / `↓` / `I` | Details sheet (metadata + Skip, Open in Immich) |
| `S` / Skip button | Skip (not recorded; client excludes it for this session) |
| `U` / `Ctrl+Z` / `⌘Z` / Undo button | Undo |

- The card only animates away after the server confirms; on failure it springs
  back and a toast shows the error.
- Client holds a small queue (~10), refills at ≤3, preloads the next 3 preview images.
- Stats bar: progress bar + kept / trashed / favourited / remaining / %.
- Scope picker: library or album, order, date range; saved via `PUT /api/scope`.
- Login page at `/login`; route middleware redirects when unauthenticated.
- Mobile-first: works one-handed on iPhone Safari (safe-area insets, no
  pull-to-refresh or overscroll during swipes, `touch-action: none` on the card).
