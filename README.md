# V2Hub Mini App

A lightweight web interface for managing V2Hub subscriptions and sources.
Built with FastAPI (backend) and vanilla JS (frontend) — no build step required.

---

## Project Structure

```
v2hub-miniapp/
├── app/                        # Application source
│   ├── src/app/
│   │   ├── main.py             # FastAPI entry point
│   │   ├── config.py           # Settings (env-driven)
│   │   ├── models/             # Pydantic request/response models
│   │   ├── routes/             # API route handlers
│   │   ├── services/           # Business logic, client factory
│   │   └── utils/              # Helpers, exception mapping
│   ├── frontend/               # Static frontend (HTML + CSS + JS)
│   ├── requirements.txt
│   ├── run.py                  # Dev server entry point
│   └── .env.example
│
├── nginx/
│   ├── nginx.conf              # Production nginx config
│   ├── proxy_params            # Shared proxy headers
│   └── grafana.htpasswd        # Basic Auth credentials for /grafana/
│
├── monitoring/
│   ├── alloy/
│   │   └── config.alloy        # Grafana Alloy pipeline (logs → Loki)
│   ├── grafana/
│   │   └── datasources.yml     # Auto-provisioned Prometheus + Loki sources
│   ├── prometheus.yml          # Scrape config (scrapes app:8000/metrics)
│   └── loki.yml                # Loki storage config (tsdb v13, 7d retention)
│
├── Dockerfile                  # Container image
├── docker-compose.yml          # Compose: app + nginx + monitoring stack
└── README.md
```

## Configuration

All settings use environment variables with the `V2HUB_` prefix.
See `app/.env.example` for the full list.

| Variable              | Default   | Description                                                                              |
| --------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `V2HUB_FIXED_API_URL` | _(empty)_ | Lock the upstream API URL. Users cannot change it in the UI. Set to your v2hub instance. |
| `V2HUB_LOG_LEVEL`     | `INFO`    | `DEBUG` / `INFO` / `WARNING` / `ERROR`                                                   |
| `V2HUB_CORS_ORIGINS`  | `*`       | **Set to your domain in production.**                                                    |

---

## API Reference

| Method   | Path                                          | Description                    |
| -------- | --------------------------------------------- | ------------------------------ |
| `GET`    | `/`                                           | Frontend SPA                   |
| `GET`    | `/api/config`                                 | Server config (fixed URL flag) |
| `GET`    | `/api/health`                                 | Health check → `{"ok": true}`  |
| `POST`   | `/api/subscriptions?limit=&offset=`           | List subscriptions (paginated) |
| `POST`   | `/api/subscriptions/new`                      | Create subscription            |
| `POST`   | `/api/subscriptions/{token}`                  | Get subscription               |
| `PATCH`  | `/api/subscriptions/{token}`                  | Update name/description        |
| `DELETE` | `/api/subscriptions/{token}`                  | Delete subscription            |
| `POST`   | `/api/subscriptions/{token}/sources/add`      | Add sources                    |
| `POST`   | `/api/subscriptions/{token}/sources/replace`  | Replace all sources            |
| `GET`    | `/sub/{token}?base_url=`                      | Public subscription content    |
| `GET`    | `/api/subscriptions/{token}/qr.png?base_url=` | QR code PNG                    |

---

## Rate Limiting

Configured in nginx — no changes needed in the app.

| Zone  | Rate    | Burst | Applies to    |
| ----- | ------- | ----- | ------------- |
| `api` | 5 req/s | 20    | `/api/*`, `/` |
| `sub` | 3 req/s | 10    | `/sub/*`      |

Exceeded requests receive **HTTP 429** with a JSON body.

---

## Monitoring Stack

The monitoring stack runs as separate Docker services and is **not accessible from the internet** — all ports are internal, Grafana is exposed only through nginx.

### Services

| Service    | Image             | Internal port | Description                       |
| ---------- | ----------------- | ------------- | --------------------------------- |
| Prometheus | `prom/prometheus` | 9090          | Scrapes `/metrics` from the app   |
| Loki       | `grafana/loki`    | 3100          | Log storage, 7-day retention      |
| Alloy      | `grafana/alloy`   | 12345         | Log collector (replaces Promtail) |
| Grafana    | `grafana/grafana` | 3000          | Dashboards, accessible via nginx  |

### Accessing Grafana

Grafana is available at `/grafana/` through nginx, restricted by IP allowlist:

```
http://your-server/grafana/
```

Only IPs listed in the nginx `allow` directives can reach it. Default credentials are set via environment variables in `docker-compose.yml` (`GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD`).

### Grafana Basic Auth (optional extra layer)

If Basic Auth is enabled in nginx, credentials are stored in `nginx/grafana.htpasswd`.
To create or update the password:

```bash
# Install htpasswd if needed
apt install apache2-utils

# Create file (first time)
htpasswd -c ./nginx/grafana.htpasswd admin

# Add or update a user
htpasswd ./nginx/grafana.htpasswd admin
```

The file is mounted into the nginx container as read-only:

```yaml
- ./nginx/grafana.htpasswd:/etc/nginx/grafana.htpasswd:ro
```

> **Note:** Basic Auth and Grafana's built-in login conflict over the `Authorization` header.
> It is recommended to use **IP allowlist only** and rely on Grafana's own login screen.

### App Metrics

The FastAPI app exposes Prometheus metrics at `/metrics`. This endpoint is:

- blocked externally via nginx (`deny all`)
- accessible internally to Prometheus (Docker network)

Metrics exposed:

| Metric                              | Type      | Labels                                         |
| ----------------------------------- | --------- | ---------------------------------------------- |
| `fastapi_requests_total`            | Counter   | `method`, `path`, `app_name`                   |
| `fastapi_responses_total`           | Counter   | `method`, `path`, `status_code`, `app_name`    |
| `fastapi_requests_duration_seconds` | Histogram | `method`, `path`, `app_name`                   |
| `fastapi_requests_in_progress`      | Gauge     | `method`, `path`, `app_name`                   |
| `fastapi_exceptions_total`          | Counter   | `method`, `path`, `exception_type`, `app_name` |
| `fastapi_app_info`                  | Info      | `app_name`                                     |

### Log Pipeline

Grafana Alloy collects Docker container logs and ships them to Loki:

```
Docker containers → Alloy (discovery.docker) → Loki → Grafana
```

Logs are labeled with `container_name` and `compose_service`.
Query all app logs in Grafana Explore:

```logql
{compose_service=~"v2hub_.+"}
```

Filter by level:

```logql
{compose_service=~"v2hub_.+", level="error"}
```

### Dashboard

Import dashboard **16110** from grafana.com for a pre-built FastAPI observability view.
The `$app_name` variable is auto-populated from the `fastapi_app_info` metric.

### Alloy UI

The Alloy pipeline UI is available internally on port 12345.
Use an SSH tunnel to access it:

```bash
ssh -L 12345:localhost:12345 user@your-server
# then open http://localhost:12345
```

---

## Security Notes

- Set `V2HUB_CORS_ORIGINS` to your domain — `*` is for development only.
- `V2HUB_FIXED_API_URL` prevents users from pointing the app at arbitrary servers.
- API tokens travel in JSON request bodies, never in URLs or cookies.
- nginx enforces HSTS (`max-age=63072000`).
- Monitoring services (Prometheus, Loki, Alloy) have no public ports — internal Docker network only.
- Grafana is behind nginx IP allowlist; `/metrics` is blocked externally.

---

## Useful Commands

```bash
# App logs
docker compose logs -f app

# Nginx logs
docker compose logs -f nginx

# Monitoring logs
docker compose logs -f prometheus
docker compose logs -f loki
docker compose logs -f alloy
docker compose logs -f grafana

# Restart individual service
docker compose restart grafana
docker compose up -d --force-recreate nginx

# Reload nginx config without downtime
docker compose exec nginx nginx -s reload

# Verify nginx config
docker compose exec nginx nginx -t

# Check what's inside nginx container
docker exec v2hub_nginx cat /etc/nginx/conf.d/v2hub.conf

# Update Grafana Basic Auth password
htpasswd ./nginx/grafana.htpasswd admin

# SSH tunnel to Alloy UI
ssh -L 12345:localhost:12345 user@your-server

# Check Docker networks (debug connectivity)
docker network ls
docker compose exec nginx wget -q -O- http://grafana:3000/api/health
```
