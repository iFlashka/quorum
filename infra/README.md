# Quorum — infra

Локальная dev-инфра. Поднимается из корня репо:

```sh
pnpm infra:up      # docker compose up -d
pnpm infra:logs    # docker compose logs -f
pnpm infra:down    # docker compose down
```

## Сервисы (фаза 0)

| Сервис | Порт | Назначение | Используется с |
|---|---|---|---|
| postgres 16 | 5432 | основные данные | фаза 1 |
| redis 7 | 6379 | presence, pub/sub, кэш | фаза 2 |
| livekit | 7880 (WS), 7881 (TCP), 7882/udp | SFU для голос/видео/screenshare | фаза 5 |
| coturn | 3478 + 49152–65535/udp (host network) | TURN/STUN | фаза 4 |

В фазе 0 они нужны только чтобы убедиться что всё поднимается. Реальная интеграция начинается с фазы 1.

## Тома

Локальные данные — в `infra/data/{postgres,redis}` (в `.gitignore`). Для полного сброса:

```sh
pnpm infra:down
rm -rf infra/data
pnpm infra:up
```

## Прод (фаза 7)

`docker-compose.prod.yml` появится в фазе 7. В нём:
- секреты через env-файл (POSTGRES_PASSWORD, JWT_SECRET, LIVEKIT_KEYS, и т.д.)
- Caddy с автоматическим Let's Encrypt по домену из `QUORUM_DOMAIN`
- coturn слушает на публичном IP с time-limited credentials
- volumes с бэкапами pg_dump в cron
- сервер запускается из собранного образа (без tsx watch)
