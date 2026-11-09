# Backing up ImmichTinder

## What is at stake

The SQLite database (`/data/immich-tinder.db`, plus `-wal` and `-shm` files
while the app runs) holds **only review history and UI settings**: which
assets you kept, trashed or favourited, and your saved scope.

- Losing it **never loses photos**. Photos live in Immich; trashed photos stay
  in Immich's trash until its retention period ends, and favourites are stored
  in Immich.
- What you lose is progress: photos you already kept would **reappear** in the
  queue. Photos you trashed do not reappear (Immich excludes trashed assets
  from search), and undo history is gone.

So backups are about convenience, not data safety. Immich itself needs its own
backup strategy.

## 1. ZFS snapshots (recommended baseline)

In TrueNAS: **Data Protection > Periodic Snapshot Tasks > Add**

- Dataset: `fast/apps/immich-tinder` (recursive, so `data` and `tailscale`
  are included).
- Schedule: e.g. hourly, keep 2 days; plus daily, keep 30 days.
- Optionally replicate the dataset to another pool or machine
  (**Replication Tasks**).

SQLite in WAL mode is crash-safe, so a snapshot taken while the app runs is
equivalent to a power cut: SQLite recovers it on next open. The last few
seconds of reviews may be missing, which is harmless here.

## 2. Nightly consistent copy, keeping N backups (optional)

`deploy/backup/backup-db.sh` makes an online backup with SQLite's backup API
(through the `better-sqlite3` module already inside the app container, so no
`sqlite3` binary or extra image is needed), checks it with
`PRAGMA integrity_check`, writes it to `/data/backups/` and keeps the newest N.

1. Copy the script to the NAS, e.g.
   `/mnt/fast/apps/immich-tinder/backup-db.sh`, and `chmod 700` it.
2. **System > Advanced Settings > Cron Jobs > Add**:
   - Command: `/mnt/fast/apps/immich-tinder/backup-db.sh immich-tinder 14`
   - Run as user: `root` (it needs `docker`)
   - Schedule: daily, e.g. 03:30
3. Run it once by hand and check `ls -l /mnt/fast/apps/immich-tinder/data/backups`.

Backups land on the same dataset, so snapshots and replication pick them up.
Arguments: container name (default `immich-tinder`) and number of copies
(default 14). Set `BACKUP_DIR` if `/data` is not a bind mount.

Equivalent one-off with the `sqlite3` CLI, if it is installed on the host.
Both commands are safe while the app is running:

```sh
sqlite3 /mnt/fast/apps/immich-tinder/data/immich-tinder.db \
  ".backup '/mnt/fast/apps/immich-tinder/data/backups/manual.db'"
# or
sqlite3 /mnt/fast/apps/immich-tinder/data/immich-tinder.db \
  "VACUUM INTO '/mnt/fast/apps/immich-tinder/data/backups/manual.db'"
```

Do **not** just `cp` the `.db` file while the app runs: without the `-wal`
file the copy can be stale or inconsistent.

## Restore

From a ZFS snapshot:

1. Stop the stack in Dockge.
2. Either roll back the dataset (**Datasets > Snapshots > Rollback**, which
   discards everything newer), or copy single files out of
   `/mnt/fast/apps/immich-tinder/data/.zfs/snapshot/<name>/`.
3. Start the stack.

From a nightly backup:

```sh
cd /mnt/fast/apps/immich-tinder/data
# 1. stop the stack in Dockge first
mkdir -p broken && mv immich-tinder.db* broken/        # keep the old files
cp backups/immich-tinder-YYYYMMDD-HHMMSS.db immich-tinder.db
chown 568:568 immich-tinder.db && chmod 640 immich-tinder.db
# 2. start the stack; migrations bring an older backup up to date
```

Remove the old `-wal`/`-shm` files (moved to `broken/` above) before starting:
a WAL file left over from a different database must not be replayed onto the
restored one.

Afterwards, open the app: the stats should match the backup's date. Reviews
made after that backup are lost from history (the photos themselves are
unaffected, as above).

## Starting over

To discard review history without restoring anything, use the app's reset
action (`POST /api/review/reset`, which never touches Immich), or stop the
stack and delete `immich-tinder.db*`; a fresh database is created on start.
