#!/usr/bin/env bash
# =============================================================================
# check_health.sh — Моніторинг та автовідновлення Survey Pulse
# =============================================================================
# Використання:
#   chmod +x check_health.sh
#   ./check_health.sh          # одноразова перевірка
#
# Для роботи кожні 5 хвилин — додати в crontab:
#   */5 * * * * /path/to/check_health.sh >> /path/to/restart_history.log 2>&1
# =============================================================================

# ── Конфігурація ──────────────────────────────────────────────────────────────

# URL для перевірки (відносний до сервера)
API_URL="http://localhost:5173/api/surveys"

# Файл логу перезапусків
LOG_FILE="$(dirname "$0")/restart_history.log"

# Директорія де знаходиться docker-compose.yml
COMPOSE_DIR="$(dirname "$0")"

# Таймаут curl у секундах
CURL_TIMEOUT=10

# Кількість спроб перед перезапуском
MAX_FAILURES=2

# Файл для збереження лічильника невдалих спроб між запусками скрипту
FAILURE_COUNTER_FILE="/tmp/survey_health_failures"

# ── Кольори для термінала ─────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ── Функції ───────────────────────────────────────────────────────────────────

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  local level="$1"
  local message="$2"
  local entry="[$(timestamp)] [$level] $message"
  echo -e "$entry" | tee -a "$LOG_FILE"
}

log_ok()   { log "OK"      "$1"; }
log_warn() { log "WARN"    "$1"; }
log_err()  { log "ERROR"   "$1"; }
log_info() { log "INFO"    "$1"; }

get_failures() {
  if [[ -f "$FAILURE_COUNTER_FILE" ]]; then
    cat "$FAILURE_COUNTER_FILE"
  else
    echo 0
  fi
}

set_failures() {
  echo "$1" > "$FAILURE_COUNTER_FILE"
}

reset_failures() {
  set_failures 0
}

# ── Перевірка залежностей ─────────────────────────────────────────────────────

check_deps() {
  local missing=()
  for cmd in curl docker; do
    if ! command -v "$cmd" &>/dev/null; then
      missing+=("$cmd")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log_err "Відсутні залежності: ${missing[*]}. Встановіть їх та повторіть."
    exit 1
  fi
}

# ── Перевірка стану контейнерів ───────────────────────────────────────────────

check_containers() {
  local all_up=true
  local containers=("survey_postgres" "survey_redis" "survey_backend" "survey_frontend")

  for container in "${containers[@]}"; do
    local status
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)
    if [[ "$status" != "running" ]]; then
      log_warn "Контейнер $container не запущений (статус: ${status:-не знайдено})"
      all_up=false
    fi
  done

  echo "$all_up"
}

# ── Перевірка API ─────────────────────────────────────────────────────────────

check_api() {
  local http_code
  http_code=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --max-time "$CURL_TIMEOUT" \
    --retry 0 \
    "$API_URL"
  )

  echo "$http_code"
}

# ── Перезапуск контейнерів ────────────────────────────────────────────────────

do_restart() {
  local reason="$1"

  log_warn "⚠️  Починаємо перезапуск. Причина: $reason"

  # Перехід у директорію з docker-compose.yml
  cd "$COMPOSE_DIR" || {
    log_err "Не вдалося перейти в $COMPOSE_DIR"
    return 1
  }

  # Спочатку спробуємо м'який restart
  if docker compose restart 2>&1 | tee -a "$LOG_FILE"; then
    log_info "✅ docker compose restart виконано успішно"
    reset_failures
  else
    # Якщо restart не спрацював — down + up
    log_warn "restart не вдався, виконуємо down + up..."
    docker compose down 2>&1 | tee -a "$LOG_FILE"
    sleep 5
    if docker compose up -d 2>&1 | tee -a "$LOG_FILE"; then
      log_info "✅ docker compose up -d виконано успішно"
      reset_failures
    else
      log_err "❌ Не вдалося підняти контейнери! Потрібне ручне втручання."
      return 1
    fi
  fi
}

# ── Ротація лог-файлу (якщо > 10 MB) ─────────────────────────────────────────

rotate_log() {
  local max_size=$((10 * 1024 * 1024)) # 10 MB
  if [[ -f "$LOG_FILE" ]]; then
    local size
    size=$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)
    if [[ "$size" -gt "$max_size" ]]; then
      mv "$LOG_FILE" "${LOG_FILE}.$(date '+%Y%m%d_%H%M%S').bak"
      log_info "Лог-файл заротовано (перевищив 10 MB)"
    fi
  fi
}

# ── Головна логіка ────────────────────────────────────────────────────────────

main() {
  rotate_log
  check_deps

  log_info "═══════════════════════════════════════════"
  log_info "Запуск перевірки здоров'я Survey Pulse"
  log_info "API URL: $API_URL"

  # 1. Перевіряємо стан контейнерів
  containers_ok=$(check_containers)
  if [[ "$containers_ok" != "true" ]]; then
    log_warn "Один або більше контейнерів не запущені"
    do_restart "Контейнери не запущені"
    exit 0
  fi

  # 2. Перевіряємо API через HTTP
  http_code=$(check_api)

  if [[ "$http_code" =~ ^[23] ]]; then
    # 2xx або 3xx — все добре
    log_ok "API відповідає. HTTP $http_code ← $API_URL"
    reset_failures
  elif [[ "$http_code" == "401" || "$http_code" == "403" ]]; then
    # 401/403 означає що API живий, просто потрібна авторизація — це нормально
    log_ok "API відповідає (захищений ендпоінт). HTTP $http_code ← $API_URL"
    reset_failures
  elif [[ "$http_code" == "429" ]]; then
    # Rate limit — API живий, просто захищається
    log_ok "API живий (rate limit). HTTP 429 ← $API_URL"
    reset_failures
  elif [[ "$http_code" == "000" ]]; then
    # curl не зміг підключитися (timeout або відмова з'єднання)
    local failures
    failures=$(get_failures)
    failures=$((failures + 1))
    set_failures "$failures"
    log_err "API не відповідає (timeout/connection refused). Невдалих спроб: $failures/$MAX_FAILURES"

    if [[ "$failures" -ge "$MAX_FAILURES" ]]; then
      do_restart "API не відповідає $failures разів поспіль"
    else
      log_warn "Чекаємо наступної перевірки (спроба $failures/$MAX_FAILURES)..."
    fi
  else
    # 5xx або інша несподівана відповідь
    local failures
    failures=$(get_failures)
    failures=$((failures + 1))
    set_failures "$failures"
    log_err "API повернув помилку HTTP $http_code. Невдалих спроб: $failures/$MAX_FAILURES"

    if [[ "$failures" -ge "$MAX_FAILURES" ]]; then
      do_restart "HTTP $http_code від API $failures разів поспіль"
    else
      log_warn "Чекаємо наступної перевірки (спроба $failures/$MAX_FAILURES)..."
    fi
  fi

  log_info "Перевірка завершена"
  log_info "═══════════════════════════════════════════"
}

main "$@"
