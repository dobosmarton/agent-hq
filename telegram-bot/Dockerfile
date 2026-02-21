FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/

# Type-check at build time (no emit needed — tsx runs source directly)
RUN npx tsc --noEmit

CMD ["npx", "tsx", "src/bot.ts"]
