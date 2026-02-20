FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npx tsc

FROM node:22-alpine
WORKDIR /app

# Install git, GitHub CLI, and Claude Code CLI
RUN apk add --no-cache git github-cli
RUN npm install -g @anthropic-ai/claude-code

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY config.json ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
