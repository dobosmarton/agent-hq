FROM node:22-alpine
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .prettierrc ./

# Copy package manifests for install
COPY telegram-bot/package.json telegram-bot/
COPY packages/ packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY telegram-bot/src/ telegram-bot/src/
COPY telegram-bot/tsconfig.json telegram-bot/

# Type-check at build time (no emit needed — tsx runs source directly)
RUN pnpm --filter agent-hq-bot build

WORKDIR /app/telegram-bot
CMD ["npx", "tsx", "src/bot.ts"]
