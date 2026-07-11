# McNotes

A cozy, distraction-free, self-hosted markdown notes and outlining app. Write
books, novels, and outlines in a clean editor with a file-tree, per-project
organization, full-text search, and offline (PWA) support — all backed by plain
markdown files you own.

- **Your data, your files** — notes are stored as ordinary `.md` files on disk.
- **Multi-user** — first account becomes the admin; registration can be toggled.
- **Self-hostable** — ships as a single multi-arch Docker image.
- **Installable PWA** — works offline and installs to your device.

---

## Quick start (Docker Compose)

1. Create a `docker-compose.yml` (or copy the one in this repo) and replace
   `OWNER` with the GitHub owner that publishes the image:

   ```yaml
   services:
     mcnotes:
       image: ghcr.io/OWNER/notes:latest
       container_name: mcnotes
       restart: unless-stopped
       ports:
         - "3010:3010"
       environment:
         ALLOW_REGISTRATION: "false"
       volumes:
         - mcnotes-data:/data

   volumes:
     mcnotes-data:
   ```

2. Start it:

   ```bash
   docker compose up -d
   ```

3. Open <http://localhost:3010>, go to **Create account**, and register. The
   **first account you create becomes the administrator.**

> The first-ever account is always permitted regardless of `ALLOW_REGISTRATION`,
> so you can always bootstrap the admin.

### Quick start (docker run)

```bash
docker run -d \
  --name mcnotes \
  -p 3010:3010 \
  -v mcnotes-data:/data \
  ghcr.io/OWNER/notes:latest
```

---

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example).

| Variable             | Default | Description                                                                                             |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `DATA_DIR`           | `/data` | Directory for the SQLite database and per-user markdown files (mount this as a volume).                 |
| `JWT_SECRET`         | _auto_  | Secret used to sign session cookies. **Required in production**; auto-generated and persisted if unset. |
| `PORT`               | `3010`  | HTTP port the server listens on.                                                                        |
| `ALLOW_REGISTRATION` | `false` | Whether public self-registration is enabled. The first account is always allowed and becomes admin.     |

### Managing registration

After the admin account exists, public sign-ups are controlled from
**Admin Settings** (gear icon next to Logout) or by setting `ALLOW_REGISTRATION`.
Enable it to let others register, then disable it again once they have joined.

---

## Data & backups

Everything lives under the data volume (`/data`):

```
/data
├── users.db        # accounts + metadata (SQLite)
├── .jwt_secret     # auto-generated signing secret (if not provided)
└── users/          # per-user markdown files
    └── <username>/ ...
```

Back up by copying the volume while the container is stopped:

```bash
docker compose stop
docker run --rm -v mcnotes-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/mcnotes-backup.tar.gz -C /data .
docker compose start
```

Restore by extracting the archive back into the volume.

---

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Database schema migrations run automatically on start.

---

## Running behind a reverse proxy

Terminate TLS at a reverse proxy (Caddy, Nginx, Traefik) and forward to the
container's port. Session cookies are marked `Secure` in production, so serve
the app over HTTPS.

---

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3010
```

Local notes/database are written to `./data` (override with `DATA_DIR`).

Build a production image locally:

```bash
docker build -t mcnotes:local .
docker run --rm -p 3010:3010 -v mcnotes-data:/data mcnotes:local
```

---

## License

[MIT](LICENSE)

