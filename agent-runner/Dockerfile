FROM node:22-alpine
WORKDIR /app

# Install git, GitHub CLI, Claude Code CLI, and pnpm
RUN apk add --no-cache bash git github-cli
RUN npm install -g @anthropic-ai/claude-code pnpm

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .prettierrc ./

# Copy package manifests for install
COPY agent-runner/package.json agent-runner/
COPY packages/ packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY agent-runner/src/ agent-runner/src/
COPY agent-runner/skills/ agent-runner/skills/
COPY agent-runner/tsconfig.json agent-runner/
COPY agent-runner/entrypoint.sh agent-runner/
RUN chmod +x agent-runner/entrypoint.sh

# Type-check at build time (no emit needed — tsx runs source directly)
RUN pnpm --filter agent-runner build

WORKDIR /app/agent-runner
ENTRYPOINT ["./entrypoint.sh"]
