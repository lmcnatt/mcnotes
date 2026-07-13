# McNotes

A cozy, distraction-free, self-hosted markdown notes and outlining app. Write
books, novels, and outlines in a clean editor with a file-tree, per-project
organization, full-text search, and offline (PWA) support — all backed by plain
markdown files you own.

- **Your data, your files** — notes are stored as ordinary `.md` files on disk.
- **Multi-user** — first account becomes the admin; registration can be toggled.
- **Self-hostable** — single Docker image, works everywhere (Linux, macOS, Windows).
- **Installable PWA** — works offline and installs to your device.

---

## Getting Started (5 minutes)

### Quickest start (one command)

```bash
docker run -d \
  --name mcnotes \
  -p 3010:3010 \
  -v mcnotes-data:/data \
  ghcr.io/lmcnatt/mcnotes:latest
```

Open <http://localhost:3010>, create your first account (becomes admin), and start writing. Done.

Stop it anytime: `docker stop mcnotes`

---

### Full setup with docker-compose (recommended for production)

**Step 1: Get the docker-compose file**

```bash
mkdir mcnotes && cd mcnotes
curl -O https://raw.githubusercontent.com/lmcnatt/mcnotes/main/docker-compose.yml
```

Or clone the repo:
```bash
git clone https://github.com/lmcnatt/mcnotes.git && cd mcnotes
```

**Step 2: Start**

```bash
docker compose up -d
```

Open <http://localhost:3010> and create your first account. **This account becomes the admin.**

**Step 3: Optional — expose via a reverse proxy**

McNotes listens on port `3010`. Point any reverse proxy at `http://localhost:3010`.

**nginx**

```nginx
server {
    listen 80;
    server_name notes.example.com;
    location / {
        proxy_pass http://localhost:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Add HTTPS: `sudo certbot --nginx -d notes.example.com`

**Apache2**

Enable modules first: `sudo a2enmod proxy proxy_http`

```apacheconf
<VirtualHost *:80>
    ServerName notes.example.com
    ProxyPreserveHost On
    ProxyPass / http://localhost:3010/
    ProxyPassReverse / http://localhost:3010/
</VirtualHost>
```

Add HTTPS: `sudo certbot --apache -d notes.example.com`

**Caddy** (standalone)

```
notes.example.com {
    reverse_proxy localhost:3010
}
```

Caddy auto-provisions HTTPS — no certbot step needed.

**Traefik, HAProxy, etc.** — proxy `http://localhost:3010`, standard config for each.

---

## Backups

Your data lives in the `mcnotes-data` Docker volume. 

**With docker-compose**, the data folder is visible as `mcnotes-data/` (actual files on your machine).

**With `docker run`**, it's a named volume (managed by Docker internally).

### Backup to a file (docker-compose)

```bash
# Stop the container
docker compose stop

# Create a tar file
tar czf mcnotes-backup-$(date +%Y-%m-%d).tar.gz mcnotes-data/

# Restart
docker compose start
```

### Backup to a file (docker run)

```bash
# Stop the container
docker stop mcnotes

# Extract the volume into a tar file
docker run --rm -v mcnotes-data:/data -v "$PWD:/backup" \
  alpine tar czf /backup/mcnotes-backup-$(date +%Y-%m-%d).tar.gz -C /data .

# Restart
docker start mcnotes
```

### Backup to cloud (AWS S3, etc.)

**With docker-compose:**
```bash
aws s3 sync mcnotes-data s3://my-bucket/mcnotes-backup --delete
```

**With `docker run`:**
```bash
docker run --rm -v mcnotes-data:/data -v ~/.aws:/root/.aws \
  amazon/aws-cli s3 sync /data s3://my-bucket/mcnotes-backup --delete
```

### Restore from backup

**With docker-compose:**
```bash
docker compose stop
tar xzf mcnotes-backup-2026-07-13.tar.gz
docker compose start
```

**With `docker run`:**
```bash
docker stop mcnotes
docker run --rm -v mcnotes-data:/data -v "$PWD:/backup" \
  alpine tar xzf /backup/mcnotes-backup-2026-07-13.tar.gz -C /data
docker start mcnotes
```

---

## Upgrading

**Docker run:**
```bash
docker stop mcnotes
docker rm mcnotes
docker pull ghcr.io/lmcnatt/mcnotes:latest
docker run -d \
  --name mcnotes \
  -p 3010:3010 \
  -v mcnotes-data:/data \
  ghcr.io/lmcnatt/mcnotes:latest
```

**Docker compose:**
```bash
docker compose pull
docker compose up -d
```

New versions apply database migrations automatically. Your data is safe.

---

## Troubleshooting

### Container won't start

**Docker run:**
```bash
docker logs mcnotes
```

**Docker compose:**
```bash
docker compose logs mcnotes
```

### Check if it's running

```bash
curl http://localhost:3010/api/health
```

### Stop/restart

**Docker run:**
```bash
docker stop mcnotes
docker start mcnotes
docker rm mcnotes  # to remove permanently
```

**Docker compose:**
```bash
docker compose stop
docker compose start
docker compose down  # to remove permanently
```

### Delete all data and start fresh

**Docker run:**
```bash
docker stop mcnotes
docker rm mcnotes
docker volume rm mcnotes-data
docker run -d --name mcnotes -p 3010:3010 -v mcnotes-data:/data ghcr.io/lmcnatt/mcnotes:latest
```

**Docker compose:**
```bash
docker compose down -v
docker compose up -d
```

---

## For developers

Requires Node.js 20+.

```bash
# Install deps
npm install

# Start dev server (hot reload)
npm run dev
```

Open <http://localhost:3010>. Local data goes to `./data/`.

Build and test the production Docker image:

```bash
docker build -t mcnotes:local .
docker compose -f docker-compose.yml up -d  # uses local image if built
```

---

## Advanced configuration

All settings are optional. Set them in the `environment:` section of `docker-compose.yml` (uncomment the relevant lines).

| Option               | Default   | What it does                                                          |
| -------------------- | --------- | --------------------------------------------------------------------- |
| `JWT_SECRET`         | auto-gen  | Secret for session tokens. Auto-generated and persisted on first run. |
| `ALLOW_REGISTRATION` | `"false"` | Allow public self-registration. First account always allowed.         |

### Managing users

- **First account**: Always allowed, becomes admin (even if registration is off).
- **Other accounts**: Gated by the registration toggle.
- **Toggle registration**: Admin can enable/disable from **Admin Settings** (gear icon next to Logout).

---

## License

[MIT](LICENSE)


