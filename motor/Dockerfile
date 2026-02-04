FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

CMD exec gunicorn -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:${PORT} main:app

COPY labels.json /app/labels.json

# --- ScanKey: raise Gunicorn timeouts for model bootstrap ---
RUN mkdir -p /app
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
ENV GUNICORN_TIMEOUT=300 GUNICORN_GRACEFUL_TIMEOUT=300
CMD ["/app/start.sh"]
