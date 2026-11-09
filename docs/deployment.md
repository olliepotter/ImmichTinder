# Deploying ImmichTinder on TrueNAS SCALE with Dockge

This guide targets a TrueNAS SCALE box (written against a UGREEN DXP4800 Pro)
running Dockge, with Immich already running in Docker on the same machine.
The result is private HTTPS access from your own iPhone and Mac at
`https://immich-tinder.<your-tailnet>.ts.net`, with **no public exposure**.

```
iPhone / Mac ──tailnet (WireGuard)──▶ tailscale sidecar :443 (tailscale serve, HTTPS)
                                         │  shared network namespace
                                         ▼
                                      immich-tinder 127.0.0.1:3000 ──Immich network──▶ immich_server:2283
                                         │
                                         ▼
                                      /data (TrueNAS dataset, SQLite)
```

Two ways to run Tailscale are covered:

- **A. Sidecar (recommended):** `docker-compose.tailscale.yml`. Self-contained;
  the app gets its own tailnet node and hostname.
- **B. TrueNAS's Tailscale app on the host:** `docker-compose.yml` plus
  `tailscale serve` on the host (see [Alternative](#alternative-truenas-tailscale-app--tailscale-serve-on-the-host)).

Contents:

1. [Safety checklist](#safety-checklist)
2. [Create the dataset and set permissions](#1-create-the-dataset-and-set-permissions)
3. [Create a restricted Immich API key](#2-create-a-restricted-immich-api-key)
4. [Find the Immich network and host name](#3-find-the-immich-network-and-host-name)
5. [Prepare Tailscale](#4-prepare-tailscale)
6. [Fill in .env](#5-fill-in-env)
7. [Deploy the stack in Dockge](#6-deploy-the-stack-in-dockge)
8. [Verify on iPhone and Mac](#7-verify-on-iphone-and-mac)
9. [Updating](#8-updating)
10. [Troubleshooting](#troubleshooting)

## Safety checklist

Do all of these **before** your first real review session:

- [ ] **Immich trash is enabled** (Administration > Settings > Trash Settings),
      with a retention period you are comfortable with (e.g. 30 days).
      ImmichTinder only ever moves photos to the trash (`force: false`); with
      trash disabled, Immich would delete immediately.
- [ ] **Try it on a test album first.** Create an album with a handful of
      disposable images, pick it in the scope picker, swipe left on a few, and
      confirm they appear in Immich's trash and can be restored.
- [ ] **Funnel is off.** `tailscale funnel status` on the node (or the
      Machines page in the admin console) shows no Funnel. The provided
      `serve.json` sets `AllowFunnel` to `false`; never enable it.
- [ ] **No ports on 0.0.0.0.** `docker ps` shows no `0.0.0.0:...->3000/tcp`
      mapping for `immich-tinder`.
- [ ] The Immich API key has **only** the permissions listed below.
- [ ] `NUXT_APP_PASSWORD` is strong and `NUXT_SESSION_PASSWORD` is random.
- [ ] The dataset is covered by periodic snapshots (see [backup.md](backup.md)).

## 1. Create the dataset and set permissions

The container runs as UID/GID **568:568**, TrueNAS's built-in `apps` user, and
needs to write the SQLite database (plus its `-wal`/`-shm` files) in `/data`.

1. **Datasets > Add Dataset** on your NVMe pool, e.g. `fast/apps/immich-tinder`
   (replace `fast` with your pool name). Choose the **Apps** dataset preset.
2. Inside it, create the directories the stack mounts. From
   **System > Shell** (as root):

   ```sh
   BASE=/mnt/fast/apps/immich-tinder
   mkdir -p "$BASE/data" "$BASE/tailscale"
   chown -R 568:568 "$BASE/data"      # app user (apps:apps)
   chmod 750 "$BASE/data"
   chown root:root "$BASE/tailscale"  # tailscaled runs as root in its container
   chmod 700 "$BASE/tailscale"
   ```

   Or use **Datasets > (dataset) > Permissions > Edit** and set owner
   user/group to `apps`/`apps`, with "Apply recursively".

**Using a different UID/GID:** set `APP_UID`/`APP_GID` in `.env` (the compose
files pass them as `user:`), and `chown` the data directory to match. To bake
different defaults into the image, build with
`--build-arg APP_UID=... --build-arg APP_GID=...`.

## 2. Create a restricted Immich API key

In Immich: **Account Settings > API Keys > New API Key**. Name it
`immich-tinder` and grant **only** these permissions (from
[DESIGN.md](DESIGN.md)):

| Permission | Used for |
|---|---|
| `asset.read` | search candidates, asset details |
| `asset.view` | preview images |
| `asset.update` | favourite / un-favourite |
| `asset.delete` | move to trash (`force: false`) and restore from trash (undo) |
| `asset.statistics` | counts for the progress bar |
| `album.read` | album scope picker |
| `user.read` | identify the current user (scopes review history) |

`timeline.read` is not needed. Copy the key; Immich shows it once.

## 3. Find the Immich network and host name

The app must join the Docker network your Immich server is on.

```sh
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i immich
docker network ls
docker inspect immich_server --format '{{json .NetworkSettings.Networks}}'
```

- Immich deployed with its official compose file (e.g. a Dockge stack named
  `immich`): container `immich_server`, network usually `immich_default`.
  Use `NUXT_IMMICH_URL=http://immich_server:2283`.
- Immich from the TrueNAS app catalogue: names look like
  `ix-immich-server-1` on `ix-immich_default`. Check the port the server
  listens on **inside** the container (`docker inspect`, or the app's network
  settings); it may not be 2283.

Test from a throwaway container on that network:

```sh
docker run --rm --network immich_default node:22.23-bookworm-slim \
  node -e "fetch('http://immich_server:2283/api/server/version').then(r=>r.text()).then(console.log)"
```

## 4. Prepare Tailscale

In the [Tailscale admin console](https://login.tailscale.com/admin):

1. **DNS:** enable **MagicDNS**, then under **HTTPS Certificates** click
   **Enable HTTPS**. This is what makes `https://immich-tinder.<tailnet>.ts.net`
   work with a valid certificate.
2. **Access controls:** add a tag and restrict who can reach it. Example
   policy (merge into your existing one; if you still have the default
   "allow all" rule, remove it or this restriction has no effect):

   ```jsonc
   {
     "tagOwners": {
       "tag:immich-tinder": ["autogroup:admin"]
     },
     "grants": [
       {
         // Only your own devices may reach the app, and only on HTTPS.
         "src": ["you@example.com"],
         "dst": ["tag:immich-tinder"],
         "ip":  ["tcp:443"]
       }
     ]
   }
   ```

   Using the older `acls` syntax instead:
   `{"action": "accept", "src": ["you@example.com"], "dst": ["tag:immich-tinder:443"]}`.
   The tagged node itself needs no outbound rules.
3. **Auth key:** **Settings > Keys > Generate auth key**: not reusable,
   **pre-approved**, tagged `tag:immich-tinder`. Tagged nodes do not expire.
   Copy the `tskey-auth-...` value. It is only used for the first login.

Funnel stays **off**: it is never enabled by these files, and `serve.json`
explicitly sets `AllowFunnel` to `false`.

## 5. Fill in .env

Generate the secrets:

```sh
openssl rand -base64 48   # NUXT_SESSION_PASSWORD
openssl rand -base64 24   # a strong NUXT_APP_PASSWORD, if you like
```

The `.env` next to the compose file is read by Compose for interpolation.
Each container receives only the variables listed under its `environment:`,
so the app never sees `TS_AUTHKEY` and the sidecar never sees the Immich key.

```dotenv
# --- Stack (compose interpolation) ---
DATA_PATH=/mnt/fast/apps/immich-tinder/data
TS_STATE_PATH=/mnt/fast/apps/immich-tinder/tailscale
IMMICH_NETWORK=immich_default
APP_UID=568
APP_GID=568

# --- Tailscale sidecar (docker-compose.tailscale.yml only) ---
TS_AUTHKEY=tskey-auth-xxxxxxxxxxxx
TS_HOSTNAME=immich-tinder
TS_TAG=tag:immich-tinder

# --- App (see .env.example and docs/DESIGN.md) ---
NUXT_IMMICH_URL=http://immich_server:2283
NUXT_IMMICH_API_KEY=your-restricted-key
NUXT_APP_PASSWORD=a-strong-password
NUXT_SESSION_PASSWORD=output-of-openssl-rand-base64-48
NUXT_PUBLIC_IMMICH_WEB_URL=https://immich.<your-tailnet>.ts.net
```

Notes:

- `NUXT_DATABASE_PATH`, `HOST` and `PORT` are fixed by the compose files; any
  value in `.env` is overridden (the container's root filesystem is
  read-only, so the DB must live in `/data`).
- After the Tailscale node has logged in once, you can delete `TS_AUTHKEY`
  (state is kept in `TS_STATE_PATH`).
- `.env` holds secrets: `chmod 600` it and keep it out of git.

## 6. Deploy the stack in Dockge

1. In Dockge, **+ Compose**, stack name `immich-tinder`.
2. Paste the contents of `docker-compose.tailscale.yml` (option A) or
   `docker-compose.yml` (option B) into the compose editor.
3. Image source: by default the stack pulls
   `ghcr.io/olliepotter/immichtinder:latest` (multi-arch, built by CI). To
   build from the GitHub repo instead, comment out `image:` and uncomment the
   `build:` block (needs Docker with BuildKit, which TrueNAS ships). Pin a
   release tag such as `:1.2` instead of `latest` if you prefer controlled
   upgrades.
4. Paste your `.env` into the **.env** pane.
5. **Deploy**. Watch the logs: the `tailscale` container should log in and
   print its serve config; `immich-tinder` should report `Listening on
   http://127.0.0.1:3000` and turn **healthy** within about 30 seconds.

Check from the TrueNAS shell:

```sh
docker ps --filter name=immich-tinder
docker inspect --format '{{.State.Health.Status}}' immich-tinder
docker exec immich-tinder-tailscale tailscale --socket=/tmp/tailscaled.sock serve status
docker exec immich-tinder-tailscale tailscale --socket=/tmp/tailscaled.sock funnel status  # must show no Funnel
```

The inline `configs:` block in `docker-compose.tailscale.yml` needs Docker
Compose 2.23.1 or newer. If yours is older, delete the `configs:` sections,
copy `deploy/tailscale/serve.json` into `<stack dir>/deploy/tailscale/`, and
uncomment the `./deploy/tailscale:/config:ro` mount.

### Why the sidecar shares its network namespace

The app runs with `network_mode: service:tailscale`. The sidecar joins the
Immich network, so the shared namespace can resolve and reach `immich_server`;
`tailscale serve` proxies `https://${TS_CERT_DOMAIN}:443` to
`http://127.0.0.1:3000` inside that same namespace; and the app binds to
`127.0.0.1` only, so other containers on the Immich network and the LAN cannot
reach it at all. The cost: if the `tailscale` container is recreated, the app
must be restarted too (Dockge's **Restart** on the stack does both).

### Alternative: TrueNAS Tailscale app + `tailscale serve` on the host

If you already run TrueNAS's own **Tailscale** app (Apps > Discover >
Tailscale) with **Host Network** enabled:

1. Deploy `docker-compose.yml` (app only) and uncomment its loopback port
   mapping `127.0.0.1:3000:3000`. Never use `3000:3000`, which listens on all
   interfaces.
2. Enable HTTPS certificates in the admin console as above.
3. Run `tailscale serve` inside the Tailscale app container (find its name
   with `docker ps | grep -i tailscale`):

   ```sh
   docker exec <tailscale-container> tailscale serve --bg --https=443 http://127.0.0.1:3000
   docker exec <tailscale-container> tailscale serve status
   docker exec <tailscale-container> tailscale funnel status   # must show no Funnel
   ```

   The URL is then the NAS's own MagicDNS name, e.g.
   `https://truenas.<tailnet>.ts.net`, not `immich-tinder...`. Serve config
   persists in the app's state. Apply the ACL grant to the NAS's tag or
   device instead of `tag:immich-tinder`.

## 7. Verify on iPhone and Mac

1. Install Tailscale on the device and log in to the same tailnet.
2. Open `https://immich-tinder.<your-tailnet>.ts.net`
   (e.g. `https://immich-tinder.beaver-alewife.ts.net`). The certificate
   should be valid with no warning. The first request may take a few seconds
   while the certificate is issued.
3. Log in with `NUXT_APP_PASSWORD`, choose your **test album**, and swipe a few
   photos. Check them in Immich (trash, favourites), then undo.
4. `https://immich-tinder.<tailnet>.ts.net/api/health` should return
   `{"ok":true,"db":"ok","immich":"ok",...}`.
5. iPhone: Safari > Share > **Add to Home Screen** for a full-screen app.
6. With Tailscale turned **off** on the device, the URL must not load.

## 8. Updating

- **Prebuilt image:** in Dockge, open the stack and click **Update** (pulls
  and redeploys), or from the shell, in the stack directory:
  `docker compose pull && docker compose up -d`.
- **Built from GitHub:** `docker compose build --pull && docker compose up -d`.
- Database migrations run automatically at startup. Take a snapshot before
  big upgrades (see [backup.md](backup.md)).
- Clean up old images now and then: `docker image prune`.

## Troubleshooting

**`SQLITE_CANTOPEN` / `EACCES` / permission denied on `/data`**
The data directory is not writable by 568:568 (or your `APP_UID`/`APP_GID`).
`ls -ln /mnt/fast/apps/immich-tinder/data` should show `568 568`. Fix with
`chown -R 568:568 .../data`. Check that the dataset's ACL type allows it (the
Apps preset does) and that `DATA_PATH` points at the right path; a typo makes
Docker create a root-owned directory.

**Immich unreachable (`/api/health` shows `"immich":"unreachable"`, or 502s)**
- The app is not on Immich's network: check `IMMICH_NETWORK` against
  `docker network ls`. With the sidecar it is the `tailscale` container that
  joins it: `docker inspect immich-tinder-tailscale --format '{{json .NetworkSettings.Networks}}'`.
- Wrong host/port in `NUXT_IMMICH_URL`: use the container name and the port
  inside the container, no trailing slash. Test with the `docker run` command
  in step 3.
- Immich restarted with a new network (e.g. the Immich stack was recreated):
  restart the ImmichTinder stack.
- 401/403 from Immich: the API key is wrong or lacks a permission.

**Healthcheck failing / container `unhealthy`**
- `docker inspect --format '{{json .State.Health}}' immich-tinder` shows the
  last probe output.
- 503 means the database is down: see the permissions item above, and check
  the logs for migration errors.
- Connection refused: the server did not start. Check `docker logs
  immich-tinder` for missing required env vars (`NUXT_APP_PASSWORD`,
  `NUXT_SESSION_PASSWORD`, `NUXT_IMMICH_URL`, `NUXT_IMMICH_API_KEY`).
- Tailscale itself is healthy only once logged in: `docker logs
  immich-tinder-tailscale`. An expired or already-used auth key needs a new
  `TS_AUTHKEY`, then delete the contents of `TS_STATE_PATH` and redeploy.

**Login succeeds but you are immediately logged out (cookie not set)**
Session cookies are `Secure` in production, so browsers drop them over plain
HTTP. Use the `https://...ts.net` URL. Only for temporary plain-HTTP testing
on a trusted LAN, set `NUXT_COOKIE_SECURE=false` (option B with a loopback
port and an SSH tunnel, for example), and remove it afterwards. The sidecar
stack pins it to `true`.

**`https://immich-tinder...ts.net` does not resolve or has a certificate error**
MagicDNS or HTTPS certificates are not enabled in the admin console, the
device is not on the tailnet, or the ACL does not allow your device to reach
`tag:immich-tinder` on 443. If the hostname is taken, Tailscale appends `-1`;
check the Machines page.

**`read-only file system` errors**
Something tried to write outside `/data` or `/tmp`. Report it; as a
temporary workaround, remove `read_only: true` from the compose file.
