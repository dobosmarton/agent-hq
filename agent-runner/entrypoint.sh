#!/bin/sh
set -e

# Configure git credentials for pushing to GitHub
if [ -n "$GITHUB_PAT" ]; then
  git config --global credential.helper store
  echo "https://x-access-token:${GITHUB_PAT}@github.com" > ~/.git-credentials
  git config --global user.name "Agent Runner"
  git config --global user.email "agent-runner@agent-hq.local"
fi

exec node dist/index.js
