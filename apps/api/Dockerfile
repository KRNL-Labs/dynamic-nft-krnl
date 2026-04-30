FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json ./
COPY x402-1.1.0.tgz ./
RUN pnpm install --prod=false

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts

RUN pnpm build

EXPOSE 8000

CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm start"]
