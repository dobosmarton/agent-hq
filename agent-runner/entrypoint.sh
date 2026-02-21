#!/bin/sh
set -e

if [ -n "$GITHUB_PAT" ]; then
  git config --global credential.helper store
  echo "https://x-access-token:${GITHUB_PAT}@github.com" > ~/.git-credentials
  export GH_TOKEN="$GITHUB_PAT"
fi

# Trust mounted repo directories (ownership differs between host and container)
git config --global --add safe.directory '*'

# Use the user's identity for git commits
git config --global user.name "${GIT_USER_NAME:-Marton Dobos}"
git config --global user.email "${GIT_USER_EMAIL:-martondobos92@gmail.com}"

exec npx tsx src/index.ts
