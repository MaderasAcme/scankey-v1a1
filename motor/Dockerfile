FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY motor/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

COPY catalog.py /app/catalog.py
# CMD removed (use /app/start.sh)

COPY motor/labels.json /app/labels.json

# --- ScanKey: raise Gunicorn timeouts for model bootstrap ---
RUN mkdir -p /app
COPY motor/start.sh /app/start.sh
RUN chmod +x /app/start.sh
ENV GUNICORN_TIMEOUT=300 GUNICORN_GRACEFUL_TIMEOUT=300
CMD ["/app/start.sh"]
