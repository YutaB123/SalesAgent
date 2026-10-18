FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm install --global pnpm@9.15.9 \
  && cd sales-agent-ui \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r ../communications/requirements.txt -r ../knowledge/requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"
ENV NODE_ENV=production
EXPOSE 10000

RUN chmod +x /app/start.sh
CMD ["tini", "-g", "--", "/app/start.sh"]
