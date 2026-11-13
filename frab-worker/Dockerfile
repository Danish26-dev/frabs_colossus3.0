FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# config/ must sit next to frab_worker/ (the code resolves ../config)
COPY frab_worker ./frab_worker
COPY config ./config

# run unprivileged
RUN useradd --create-home --uid 10001 frab
USER frab

# Real bank data by default. No secrets are baked into the image: ZG_API_KEY,
# FRAB_API_TOKEN etc. are injected at deploy time (Secret Manager).
ENV FRAB_DATA_SOURCE=api \
    PORT=8080

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn frab_worker.api:app --host 0.0.0.0 --port ${PORT}"]
