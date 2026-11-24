FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 COMPAIN_DATA_DIR=/srv/app/data \
    COMPAIN_IMPRESSUM_FILE=/srv/app/legal/impressum COMPAIN_DATENSCHUTZ_FILE=/srv/app/legal/datenschutz \
    COMPAIN_CHANGELOG_FILE=/srv/app/CHANGELOG.md COMPAIN_OFFSITE_DIR=/srv/app/offsite
WORKDIR /srv/app

# Build context is the project folder (see docker-compose.yml).
COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/compain ./compain
COPY CHANGELOG.md ./CHANGELOG.md

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 compain && mkdir -p /srv/app/data && chown compain /srv/app/data
USER compain

EXPOSE 8080
CMD ["uvicorn", "compain.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
