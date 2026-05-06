# Развёртывание Quorum на VPS

Гайд для self-hosting на Ubuntu 22.04+. Подразумевает что у тебя уже есть домен и DNS-записи.

## Требования

- VPS ~4 vCPU / 8 GB RAM (нагрузка маленькая для 5–10 друзей; основной потребитель — coturn при relay-трафике).
- Открытые порты: 80, 443 TCP (Caddy), 3478 UDP+TCP (coturn STUN/TURN), 49152–65535 UDP (coturn media).
- Домены:
  - `quorum.example.com` — для сервера.
  - `lk.example.com` — для LiveKit (можно тот же домен на отдельном пути, но Caddy проще на subdomain'ах).
- DNS A-записи обоих доменов на IP VPS.

## Установка

```bash
# 1. Базовое окружение
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER  # перезайди после этого

# 2. Клонируем
sudo mkdir -p /opt/quorum && sudo chown $USER /opt/quorum
git clone https://github.com/USER/quorum.git /opt/quorum
cd /opt/quorum

# 3. Готовим секреты
cd infra
cp .env.prod.example .env.prod
# Заполни POSTGRES_PASSWORD / JWT_*_SECRET / TURN_SHARED_SECRET / LIVEKIT_*
# Сгенерировать каждое: openssl rand -hex 32 (или 48 для JWT)

# 4. LiveKit ключи
nano livekit/livekit.prod.yaml
# Заменить REPLACE_LIVEKIT_API_KEY и REPLACE_LIVEKIT_API_SECRET на значения из .env.prod

# 5. coturn
nano coturn/turnserver.prod.conf
# Подставить YOUR_SHARED_SECRET (= TURN_SHARED_SECRET) и YOUR_PUBLIC_IP (твой VPS IP)

# 6. Сборка сервера
cd ..
pnpm install --frozen-lockfile
pnpm build:server
mkdir -p infra/server-dist
cp -r apps/server/dist/* infra/server-dist/
cp -r apps/server/src/db/migrations infra/server-dist/  # миграции нужны в run-time
# Для node_modules самого dist'а: tsup-bundle external'ит deps, нужен install отдельно
cd infra && cp ../apps/server/package.json server-dist/ && cd server-dist && pnpm install --prod
cd ../..

# 7. Запуск
cd infra
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 8. Миграции БД (один раз)
docker compose -f docker-compose.prod.yml run --rm server node dist/db/migrate.js
```

## Caddy и TLS

Caddy v2 автоматически получит TLS-серты у Let's Encrypt по HTTP-01 challenge при первом запуске. Это занимает ~30 секунд.

Логи: `docker logs quorum-caddy -f`. Если challenge падает — обычно из-за того что DNS ещё не пропагировался или порт 80 занят чем-то ещё.

## Backups

```bash
# Поставь cron на ежедневный backup в 3:00 UTC
crontab -e
# Добавь:
0 3 * * * /opt/quorum/infra/backup.sh >> /var/log/quorum-backup.log 2>&1
```

Дампы складываются в `infra/data/backups/`, ретенция 7 дней. Регулярно копируй на внешнее хранилище.

## Обновление сервера

```bash
cd /opt/quorum
git pull
pnpm install --frozen-lockfile
pnpm build:server
cp -r apps/server/dist/* infra/server-dist/
cd infra/server-dist && pnpm install --prod && cd ..
docker compose -f docker-compose.prod.yml --env-file .env.prod restart server
# Если миграции:
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm server node dist/db/migrate.js
```

## Обновление клиента (Tauri)

Релизы клиента собираются автоматически на тег `v*.*.*` через GitHub Actions. См. [release.md](release.md).

Клиенты получают обновление через `tauri-plugin-updater` — при запуске + раз в час проверяют `latest.json` в GitHub Releases.

## Healthcheck

```bash
curl -fsS https://quorum.example.com/health
# Должно вернуть {"status":"ok",...}

docker compose -f docker-compose.prod.yml --env-file .env.prod ps
# Все сервисы должны быть Up (healthy) кроме coturn (он host-network, healthcheck не работает).
```

## Troubleshooting

**Voice не работает / звонок сразу обрывается** — проверь что 49152–65535 UDP реально открыты на firewall (cloud-провайдеры часто фильтруют). `tcpdump -i eth0 udp portrange 49152-65535` должен показывать трафик при звонке.

**LiveKit отвалился через 30 минут** — проверь Redis health, LiveKit его использует для координации.

**Caddy не получает TLS** — `docker logs quorum-caddy`, типичные причины: DNS ещё не обновился, или провайдер закрыл 80-й порт.

**`pg_dump` падает** — проверь что quorum-postgres контейнер running и пароль в .env.prod не сменился.
