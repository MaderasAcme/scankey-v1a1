#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=8080}"
: "${GUNICORN_WORKERS:=1}"
: "${GUNICORN_TIMEOUT:=900}"
: "${GUNICORN_GRACEFUL_TIMEOUT:=900}"

exec gunicorn \
  -k uvicorn.workers.UvicornWorker \
  -w "${GUNICORN_WORKERS}" \
  -b "0.0.0.0:${PORT}" \
  --timeout "${GUNICORN_TIMEOUT}" \
  --graceful-timeout "${GUNICORN_GRACEFUL_TIMEOUT}" \
  --access-logfile - \
  --error-logfile - \
  --access-logformat '%(h)s %({X-Forwarded-For}i)s %({X-Request-ID}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s' \
  motor.main:app
