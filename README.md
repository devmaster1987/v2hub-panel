# V2Hub Panel

Web application for managing V2Hub subscriptions and sources.

### 🌐 Part of the [V2Hub Ecosystem](https://github.com/nestthub/nestthub/blob/main/ecosystems/v2hub/README.md)

This package is one component of V2Hub — see the full project overview, architecture, and all related repositories.

Stack:

- Backend: FastAPI + Pydantic
- Frontend: Vanilla JS + CSS (no build step)
- Package manager: uv
- Runtime: Docker Compose
- Reverse proxy: nginx
- Monitoring:

  - Prometheus
  - Loki
  - Grafana
  - Grafana Alloy

---

# Project Structure

```
v2hub_panel/
│
├── src/
│   └── v2hub_panel/
│       ├── main.py              # FastAPI entrypoint
│       ├── config.py            # Environment configuration
│       │
│       ├── routes/
│       │   ├── public.py
│       │   ├── connection.py
│       │   └── subscriptions.py
│       │
│       ├── models/              # Pydantic schemas
│       ├── services/            # Business logic
│       └── utils/
│
├── frontend/
│   ├── index.html
│   ├── scripts/
│   └── styles/
│
├── tests/
│   ├── conftest.py
│   └── test_*.py
│
├── nginx/
│   ├── default.conf.template    # nginx template
│   ├── proxy_params             # proxy headers
│   └── grafana.htpasswd
│
├── monitoring/
│   ├── alloy/
│   │   └── config.alloy
│   │
│   ├── grafana/
│   │   └── datasources.yml
│   │
│   ├── prometheus.yml
│   └── loki.yml
│
├── certbot/
│   ├── conf/
│   └── www/
│
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── uv.lock
├── .env.example
└── README.md
```

---

# Local Development

## Requirements

Install:

- Docker
- Docker Compose plugin
- Python 3.12+
- uv

---

## Environment

Create local environment:

```bash
cp .env.example .env
```

Edit values:

```env
V2HUB_FIXED_API_URL=
V2HUB_LOG_LEVEL=DEBUG
V2HUB_CORS_ORIGINS=*
```

---

# Run Full Stack Locally

The local environment runs the same stack as production:

- FastAPI
- nginx
- Grafana
- Prometheus
- Loki
- Alloy

Start:

```bash
docker compose up --build
```

Access:

Application:

```
http://127.0.0.1
```

Health check:

```
http://127.0.0.1/api/health
```

Grafana:

```
http://127.0.0.1/grafana/
```

---

# Docker Architecture

```
Browser
   |
   |
 nginx :80/:443
   |
   +----------------+
   |                |
   v                v
 FastAPI         Grafana
 app:8000        grafana:3000


FastAPI
   |
   |
Prometheus
   |
   |
Metrics


Docker logs
   |
   |
Alloy
   |
   |
Loki
   |
   |
Grafana Explore
```

---

# Nginx

Nginx uses templates.

Source:

```
nginx/default.conf.template
```

Mounted into:

```
/etc/nginx/templates/default.conf.template
```

The official nginx image automatically runs:

```
envsubst
```

and generates:

```
/etc/nginx/conf.d/default.conf
```

Check generated config:

```bash
docker exec -it v2hub_nginx cat /etc/nginx/conf.d/default.conf
```

Validate:

```bash
docker compose exec nginx nginx -t
```

Reload:

```bash
docker compose exec nginx nginx -s reload
```

---

# HTTPS / Production Notes

Local environment does NOT require SSL certificates.

Do not enable:

```
/etc/letsencrypt/live/<domain>/fullchain.pem
```

until certificates exist.

Production requires:

```
certbot/conf/
```

with generated certificates.

Expected structure:

```
certbot/conf/
└── live/
    └── panel.example.com/
        ├── fullchain.pem
        └── privkey.pem
```

Without these files nginx will fail:

```
cannot load certificate
BIO_new_file() failed
```

---

# Production Deployment

## 1. Clone repository

```bash
git clone <repository>
cd v2hub_panel
```

---

## 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Production example:

```env
V2HUB_LOG_LEVEL=INFO
V2HUB_FIXED_API_URL=https://example.com
V2HUB_CORS_ORIGINS=https://panel.example.com
```

---

## 3. Prepare certificates

Install certbot:

```bash
apt install certbot
```

Generate certificate:

```bash
certbot certonly \
  --webroot \
  -w ./certbot/www \
  -d panel.example.com
```

---

## 4. Start services

Build:

```bash
docker compose build
```

Run:

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
```

---

# Backend

Application entrypoint:

```
v2hub_panel.main:app
```

Container command:

```
uvicorn v2hub_panel.main:app
```

Internal port:

```
8000
```

Health endpoint:

```
GET /api/health
```

Response:

```json
{
  "ok": true
}
```

---

# API

## Public

```
GET /
```

Frontend SPA

```
GET /sub/{token}
```

Subscription content

```
GET /api/health
```

Health check

## Subscription API

```
POST /api/subscriptions
POST /api/subscriptions/new
POST /api/subscriptions/{token}
PATCH /api/subscriptions/{token}
DELETE /api/subscriptions/{token}
```

---

# Monitoring

## Prometheus

Scrapes:

```
app:8000/metrics
```

---

## Loki

Stores logs from Docker containers.

Pipeline:

```
Docker
 |
Alloy
 |
Loki
 |
Grafana
```

---

## Alloy

Collects Docker logs.

Config:

```
monitoring/alloy/config.alloy
```

---

## Grafana

Available through nginx:

```
/grafana/
```

Credentials:

Configured in:

```
docker-compose.yml
```

Example:

```yaml
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin
```

Change before production.

---

# Tests

## Backend tests

Install dependencies:

```bash
uv sync
```

Run:

```bash
uv run pytest
```

---

## Frontend tests

Frontend uses Vitest.

Run:

```bash
cd frontend
npm install
npm test
```

---

# Useful Docker Commands

Logs:

```bash
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f grafana
docker compose logs -f loki
docker compose logs -f alloy
```

Restart:

```bash
docker compose restart nginx
```

Rebuild:

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

Remove volumes:

```bash
docker compose down -v
```

---

# Troubleshooting

## nginx restart loop

Check:

```bash
docker compose logs nginx
```

Common cause:

Missing certificates:

```
cannot load certificate
```

Fix:

Disable SSL config locally or generate certs.

---

## App container unhealthy

Check:

```bash
docker compose logs app
```

Test:

```bash
docker exec -it v2hub_app \
curl http://localhost:8000/api/health
```

---

## nginx cannot reach app

Test:

```bash
docker exec -it v2hub_nginx \
wget -qO- http://app:8000/api/health
```

---

# Security Notes

Production:

- Change Grafana credentials
- Disable wildcard CORS
- Use HTTPS
- Keep monitoring services internal
- Do not commit `.env`
- Do not commit certificates
- Do not commit production nginx secrets

Recommended `.gitignore`:

```
.env
certbot/conf/
certbot/www/
nginx/*.htpasswd
.venv/
__pycache__/
```

---

# Deployment Checklist

Before production:

- [ ] `.env` configured
- [ ] Domain DNS configured
- [ ] SSL certificates generated
- [ ] Grafana password changed
- [ ] CORS restricted
- [ ] Docker containers healthy
- [ ] nginx config validated
- [ ] `/api/health` returns 200
- [ ] Monitoring stack running
