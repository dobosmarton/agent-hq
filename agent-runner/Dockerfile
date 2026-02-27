FROM node:22-alpine
WORKDIR /app

# Install git, GitHub CLI, and Claude Code CLI
RUN apk add --no-cache bash git github-cli
RUN npm install -g @anthropic-ai/claude-code

COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ src/
COPY skills/ skills/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Type-check at build time (no emit needed — tsx runs source directly)
RUN npx tsc --noEmit

ENTRYPOINT ["./entrypoint.sh"]
