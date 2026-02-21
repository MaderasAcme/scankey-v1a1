FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py /app/main.py
ENV PORT=8080
CMD ["sh","-c","uvicorn main:APP --host 0.0.0.0 --port ${PORT:-8080}"]
