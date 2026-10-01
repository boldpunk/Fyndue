# Fyndue — Deployment (fyndue.uz on a shared server)

Production target: the Oracle Cloud VM in Dubai (`84.235.245.27`, Ubuntu 24.04 **ARM64**, 4 OCPU / 24 GB) that already serves **boldpunk.uz**. Fyndue must not disturb that site.

Fyndue runs as its own Docker Compose project (`fyndue`) next to the other apps on the server: its own containers (`fyndue-*`), network and volumes. It brings its **own** PostgreSQL, so it never touches another app's database. Only one port is opened, on `127.0.0.1`, for the server's existing web server (nginx or Caddy) to forward `fyndue.uz` to.

```
Internet ──443──► nginx / Caddy (already on the server, also serves the other sites)
                        │  fyndue.uz → 127.0.0.1:3100
                        ▼
        ┌──────────── docker compose project "fyndue" ────────────┐
        │ web (Next.js)  ◄── scheduler (every 15 min: reminders)  │
        │   │  documents volume                                   │
        │   ▼                                                     │
        │ db (PostgreSQL 16, volume db-data, not published)       │
        │ migrate (runs pending migrations, then exits)           │
        └─────────────────────────────────────────────────────────┘
Telegram ──► https://fyndue.uz/api/telegram/webhook
```

| File | Purpose |
|---|---|
| `Dockerfile` | One image for the web app, migrations and scripts |
| `docker-compose.yml` | `db`, `migrate`, `web`, `scheduler` |
| `deploy/production.env.example` | Every setting; copy to `.env` on the server |
| `deploy/nginx-fyndue.uz.conf` | nginx site (if the server uses nginx) |
| `deploy/Caddyfile.fyndue` | Caddy block (if the server uses Caddy) |
| `deploy/Caddyfile` | Bundled Caddy, **only** for a server with nothing else on 80/443 (`COMPOSE_PROFILES=proxy`); not used on the shared server |
| `deploy/backup.sh` | Nightly database + documents backup |

**What Fyndue touches on the shared server, and nothing else:** a new folder `/opt/fyndue`, Docker containers/volumes prefixed `fyndue`, port `127.0.0.1:3100`, one **new** web-server site file for `fyndue.uz` (checked with `nginx -t` / `caddy validate` before any reload, so a typo is rejected instead of taking boldpunk.uz down) and one certificate for `fyndue.uz`. It does not change boldpunk.uz's config, its database, Docker networks or the firewall (80/443 are already open because boldpunk.uz works).

> **Data location.** The server is in the UAE. Uzbekistan's personal data law expects Uzbek citizens' personal data to be stored in Uzbekistan. For personal or family use this is usually not an issue; before opening Fyndue to the public, check the law (or move to an Uzbek host — the same files work anywhere with Docker).

## 1. DNS (Eskiz → DNS записи → fyndue.uz)

Change **only one** record — the `A` record for `fyndue.uz.` — from `45.138.159.4` to the Oracle server:

| Name | Type | Record (now) | Record (new) |
|---|---|---|---|
| `fyndue.uz.` | `A` | `45.138.159.4` | **`84.235.245.27`** |
| `www.fyndue.uz.` | `CNAME` | `fyndue.uz.` | unchanged (follows the A record) |

Leave `mail`, `webmail`, `ftp`, `MX`, `_dmarc` and the SPF `TXT` records as they are — they belong to Eskiz's mail hosting. Check (from Windows: `nslookup fyndue.uz`):

```bash
dig +short fyndue.uz        # must print the server IP before step 5
```

## 2. Look at the server (SSH)

```bash
sudo ss -ltnp '( sport = :80 or sport = :443 )'   # which web server serves boldpunk.uz: nginx, caddy, or docker-proxy?
docker ps --format '{{.Names}}\t{{.Ports}}'        # what already runs in Docker
sudo ss -ltn | grep -E ':3100\b' || echo "port 3100 is free"
docker compose version                           # Docker with the compose plugin
free -h; df -h /                                 # building needs ~2 GB RAM and ~6 GB disk
```

- Port 3100 taken → pick another and set `FYNDUE_PORT` in step 4 (and in the nginx/Caddy config).
- Less than ~2 GB free RAM → add swap for the build:
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- If 80/443 belong to `docker-proxy` (boldpunk.uz's web server runs inside Docker, e.g. Traefik or a Caddy/nginx container), stop here and share the output; the config differs.
- Ubuntu **Minimal** has no editor: `sudo apt-get install -y nano`.
- No Docker yet → `curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu`, then log out and in. (If boldpunk.uz already uses Docker, skip this.)

## 3. Get the code

The repository is private, so give the server a read-only **deploy key**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/fyndue_deploy -N "" -C "fyndue deploy"
cat ~/.ssh/fyndue_deploy.pub
```

GitHub → `boldpunk/fyndue` → Settings → Deploy keys → Add key → paste it (leave "Allow write access" off). Then:

```bash
sudo mkdir -p /opt/fyndue && sudo chown "$USER" /opt/fyndue
GIT_SSH_COMMAND="ssh -i ~/.ssh/fyndue_deploy" git clone -b claude/bold-ride-beh1cc git@github.com:boldpunk/fyndue.git /opt/fyndue
cd /opt/fyndue
git config core.sshCommand "ssh -i ~/.ssh/fyndue_deploy"
```

(Once the branch is merged into `main`, use `-b main`.)

## 4. Settings

```bash
cp deploy/production.env.example .env
chmod 600 .env
for i in 1 2 3 4; do openssl rand -hex 32; done   # four secrets
nano .env
```

Keep `COMPOSE_PROFILES` **empty** (boldpunk.uz owns ports 80/443). Fill in `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (one secret each), keep `APP_URL=https://fyndue.uz`, and set `ALLOW_REGISTRATION=true` **for now** (step 6 turns it off). Leave the Telegram lines empty until step 7 if you like.

## 5. Start and publish

```bash
docker compose up -d --build        # first build takes a few minutes (ARM64 is supported)
docker compose ps                   # db healthy, migrate exited (0), web healthy, scheduler up
curl -sI http://127.0.0.1:3100/login | head -1   # HTTP/1.1 200 OK
```

**nginx:**

```bash
sudo cp deploy/nginx-fyndue.uz.conf /etc/nginx/sites-available/fyndue.uz
sudo ln -s /etc/nginx/sites-available/fyndue.uz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d fyndue.uz -d www.fyndue.uz    # HTTPS certificate + redirect
```

**Caddy:** append `deploy/Caddyfile.fyndue` to the Caddyfile (usually `/etc/caddy/Caddyfile`), then `sudo systemctl reload caddy`. Caddy obtains the certificate itself.

Open **https://fyndue.uz** — the login page should load with a padlock.

## 6. Your account

1. Register at https://fyndue.uz/register (and family members, if any).
2. Close registration: set `ALLOW_REGISTRATION=false` in `.env`, then `docker compose up -d` (recreates `web` only).

Production starts empty; the demo seed never runs there. To move data from your PC instead, ask — it is a `pg_dump` / `pg_restore` of the local database plus a copy of `.local/storage`.

## 7. Telegram

Use a **separate bot for production** (a second `/newbot` in @BotFather). `pnpm telegram:dev` on your PC removes the bot's webhook, so sharing one bot between the PC and the server would silently stop the server's bot.

```bash
nano .env      # TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET
docker compose up -d
docker compose run --rm web tsx --conditions=react-server scripts/telegram-webhook.ts
# → @YourBot now delivers messages to https://fyndue.uz/api/telegram/webhook
```

Then Settings → Notifications → Connect Telegram. The `scheduler` container sends due reminders every 15 minutes.

## 8. Backups

```bash
sudo crontab -e
# 30 3 * * * /opt/fyndue/deploy/backup.sh >> /var/log/fyndue-backup.log 2>&1
sudo /opt/fyndue/deploy/backup.sh      # try it once now
```

Backups go to `/var/backups/fyndue` (14 days kept). That is the same disk, so also copy them off the server: download them now and then, or use Oracle's free Object Storage (20 GB in the Always Free tier) or boot-volume backups.

Restore (into an empty stack):

```bash
docker compose exec -T db pg_restore -U fyndue -d fyndue --clean --if-exists --no-owner < /var/backups/fyndue/db_<date>.dump
docker run --rm -v fyndue_documents:/data -v /var/backups/fyndue:/backup alpine:3.22 tar -xzf /backup/documents_<date>.tar.gz -C /data
```

## 9. Updating

```bash
cd /opt/fyndue
git pull
docker compose up -d --build     # migrations run automatically before the new web container starts
docker image prune -f            # remove old image layers
```

If a migration fails, the command stops with an error and the new version is not started. Check `docker compose logs migrate`; if the site is down, restore the last backup (step 8) and `git checkout` the previous commit.

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `docker compose ps`; `docker compose logs --tail=100 web` |
| Upload fails with "413" | `client_max_body_size 12m` in the nginx site (step 5) |
| Login loops back to /login | `APP_URL` must be exactly `https://fyndue.uz`; nginx must send `X-Forwarded-Proto` |
| Bot silent | re-run the webhook script (step 7); make sure `pnpm telegram:dev` isn't running with the same bot |
| No reminders | `docker compose logs scheduler`; Settings → Notifications → Recent reminders |
