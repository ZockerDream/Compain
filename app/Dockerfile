FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 COMPAIN_DATA_DIR=/srv/app/data
WORKDIR /srv/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY compain ./compain

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 compain && mkdir -p /srv/app/data && chown compain /srv/app/data
USER compain

EXPOSE 8080
CMD ["uvicorn", "compain.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
