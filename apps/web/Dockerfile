FROM node:20-bullseye

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --prod=false

COPY next.config.* ./
COPY tsconfig.json ./
COPY postcss.config.* ./
COPY public ./public
COPY src ./src

RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
