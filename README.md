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
│   └── proxy_params            # Shared proxy headers
│
├── Dockerfile                  # Container image
├── docker-compose.yml          # Compose: app + nginx + certbot
├── v2hub.service               # systemd unit
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

## Security Notes

- Set `V2HUB_CORS_ORIGINS` to your domain — `*` is for development only.
- `V2HUB_FIXED_API_URL` prevents users from pointing the app at arbitrary servers.
- API tokens travel in JSON request bodies, never in URLs or cookies.
- nginx enforces HSTS (`max-age=63072000`).

---

## Useful Commands

```bash
# App logs (bare metal)
journalctl -u v2hub -f

# Nginx logs
tail -f /var/log/nginx/error.log

# Restart app
systemctl restart v2hub

# Check SSL expiry
certbot certificates

# Docker logs
docker compose logs -f app
docker compose logs -f nginx
```
