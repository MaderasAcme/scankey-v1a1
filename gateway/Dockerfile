# Build context: repo root (../) para incluir common/
FROM python:3.11-slim
WORKDIR /app
COPY gateway/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY common /app/common
COPY gateway/main.py gateway/normalize.py gateway/roi_bbox.py gateway/size_class.py /app/
ENV PORT=8080
CMD ["sh","-c","uvicorn main:APP --host 0.0.0.0 --port ${PORT:-8080}"]
