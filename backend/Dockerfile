FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# OJO: el build context es "backend", por eso aquí NO va "backend/..."
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app/

ENV PORT=8080
EXPOSE 8080

CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
