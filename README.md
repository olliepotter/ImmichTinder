<p align="center">
  <img src="public/logo.png" alt="Immich Tinder" width="180" />
</p>

# ImmichTinder

A self-hosted, Tinder-style photo clean-up app for [Immich](https://immich.app).
Swipe through your library (or one album, or a date range) one photo at a
time: **keep** it, **favourite** it, or move it to **Immich's trash**. Your
progress is remembered, so reviewed photos never come back.

Built with Nuxt 4 (Nitro server) and SQLite. Designed to run on a home server
next to Immich and be reached privately over [Tailscale](https://tailscale.com).

This is a fork of [MaaxGr/ImmichTinder](https://github.com/MaaxGr/ImmichTinder),
reworked for safe, single-user library clean-up.

## Safety model

- **Never permanent delete.** "Trash" calls Immich with `force: false`, which
  moves the photo to Immich's trash. Nothing in the app can empty the trash or
  force-delete. Photos stay recoverable for Immich's trash retention period.
  **Make sure trash is enabled in Immich** (Administration > Settings > Trash
  Settings); without it, Immich deletes immediately.
- **Undo** reverts the last decision in Immich (restores from trash, or resets
  the favourite flag) and walks further back on repeated presses.
- **Failed Immich calls change nothing.** History is only written after Immich
  confirms.
- **The Immich API key stays on the server.** Images are proxied; the browser
  never sees the key. Use a key restricted to the permissions below.
- **Private by design.** Password login, and the deployment publishes no
  public ports: it is reached only through your tailnet (Tailscale Funnel
  stays off).

Start with a test album of disposable images before reviewing your real library.

## Controls

| Gesture | Key | Action |
|---|---|---|
| Swipe left | `←` / `D` | Trash (recoverable) |
| Swipe right | `→` / `K` | Keep |
| Swipe up | `↑` / `F` | Favourite |
| Swipe down | `↓` / `I` | Details (metadata, Skip, Open in Immich) |
| Skip button | `S` | Skip for this session (not recorded) |
| Undo button | `U` / `Ctrl+Z` / `⌘Z` | Undo the last decision |

The card only flies away once the server confirms; on failure it springs back
and shows an error. A stats bar shows kept / trashed / favourited / remaining
and overall progress. The scope picker selects the whole library or an album,
the order (random, oldest, newest) and an optional date range.

## Quick start (development)

Requires Node.js >= 22.12 and an Immich server with an API key.

```bash
npm ci
cp .env.example .env    # then fill in the values (see below)
npm run dev             # http://localhost:3000
```

For plain-HTTP local testing outside `npm run dev`, set
`NUXT_COOKIE_SECURE=false`, otherwise the session cookie is not stored.

Other scripts: `npm run build` (Nitro output in `.output/`), `npm run preview`,
`npm run lint`, `npm run typecheck`, `npm test`.

## Configuration

All configuration is via environment variables (a `.env` file in development).
Full details in [docs/DESIGN.md](docs/DESIGN.md#configuration-server-side-env-read-via-useruntimeconfig).

| Variable | Required | Description |
|---|---|---|
| `NUXT_IMMICH_URL` | yes | Immich base URL, no trailing slash, e.g. `http://immich_server:2283` |
| `NUXT_IMMICH_API_KEY` | yes | Immich API key (see permissions below) |
| `NUXT_APP_PASSWORD` | yes in production | Login password |
| `NUXT_SESSION_PASSWORD` | yes in production | At least 32 characters; seals the session cookie. Generate with `openssl rand -base64 48` |
| `NUXT_DATABASE_PATH` | no | SQLite file. Default `./data/immich-tinder.db`; `/data/immich-tinder.db` in Docker |
| `NUXT_PUBLIC_IMMICH_WEB_URL` | no | Immich web URL for "Open in Immich" links (not a secret) |
| `NUXT_COOKIE_SECURE` | no | Default `true` in production; `false` only for plain-HTTP testing |

Legacy names are still accepted as fallbacks: `IMMICH_URL`, `IMMICH_API_KEY`
(or `IMMICH_TOKEN`), `APP_PASSWORD`, `SESSION_SECRET`, `DATABASE_PATH`.

**Immich API key permissions** (grant only these): `asset.read`,
`asset.view`, `asset.update`, `asset.delete`, `asset.statistics`,
`album.read`, `user.read`.

## Deployment

The production image is multi-arch (amd64, arm64), runs as a non-root user
(UID/GID 568 by default) with a read-only root filesystem, stores its database
in `/data`, and exposes a health check at `GET /api/health`.

```bash
docker pull ghcr.io/olliepotter/immichtinder:latest
```

- [docs/deployment.md](docs/deployment.md): step-by-step for TrueNAS SCALE +
  Dockge, joining the Immich Docker network, and private HTTPS through a
  Tailscale sidecar (`docker-compose.tailscale.yml`) or the host's Tailscale
  (`docker-compose.yml`).
- [docs/backup.md](docs/backup.md): ZFS snapshots, nightly SQLite backups and
  restore.
- [docs/DESIGN.md](docs/DESIGN.md): API contract, data model and Immich calls.

Do not expose the app to the public internet.

## Credits

Original app by [MaaxGr](https://github.com/MaaxGr):
[MaaxGr/ImmichTinder](https://github.com/MaaxGr/ImmichTinder). Thanks also to
the [Immich](https://github.com/immich-app/immich) project.

## Licence

The upstream repository does not include a licence file, and this fork does
not add one.
