FROM python:3.12-slim-bookworm

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV HOST=0.0.0.0
ENV PORT=3005

EXPOSE 3005
CMD ["python", "-m", "app.main"]
