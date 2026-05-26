FROM node:20-slim

# ── Python runtime ────────────────────────────────────────────────────────────
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Node.js: install + build ──────────────────────────────────────────────────
COPY market-data-service/package*.json ./
RUN npm install
COPY market-data-service/ .
RUN npm run build

# ── Python: isolated venv + dependencies ─────────────────────────────────────
COPY requirements.txt ./
RUN python3 -m venv /venv \
 && /venv/bin/pip install --no-cache-dir -r requirements.txt

# ── Agent source (most-changed layer — copy last) ─────────────────────────────
COPY agents/  ./agents/
COPY configs/ ./configs/

# ── Startup script ────────────────────────────────────────────────────────────
COPY market-data-service/docker-start.sh ./
RUN chmod +x docker-start.sh

EXPOSE 3001
CMD ["./docker-start.sh"]
