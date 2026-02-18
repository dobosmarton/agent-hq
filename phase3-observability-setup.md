# Phase 3: Observability Dashboard Deployment on VPS

## Context

You're implementing Phase 3 of the Agent HQ plan — deploying the real-time observability dashboard on the VPS alongside Plane. The dashboard shows what every Claude Code agent is doing across all your projects. Claude Code agents run locally on your Mac; hooks send events to the VPS where the dashboard stores and displays them.

**Prerequisites**: Phase 2 complete (VPS provisioned, Plane running, Docker installed).

---

## Current State (2026-02-17)

### What's Running

| Service | Status | Access |
|---------|--------|--------|
| Observability server (Bun API + SQLite) | Running (12h+ uptime) | Internal port 4000 |
| Observability web (Caddy + Vue SPA) | Running (12h+ uptime) | `http://<vps-tailscale-ip>:4080` via Tailscale |
| Plane (full stack) | Running (37h+ uptime) | `http://<vps-tailscale-ip>:80` via Tailscale |
| OpenClaw gateway | Running (13h+ uptime) | localhost:18789-18790 (VPS only) |
| Tailscale | Active, direct connection | VPS: `<vps-tailscale-ip>`, Mac: `<mac-tailscale-ip>` |

### Network Approach: Tailscale (replaces Cloudflare Tunnel)

The original plan used Cloudflare Tunnel for HTTPS access via `dashboard.martondobos.com`. This was **dropped due to domain configuration difficulties**. Instead, **Tailscale** provides a private encrypted mesh network between Mac and VPS:

```
Mac (<mac-tailscale-ip>)  ◄──── Tailscale encrypted mesh ────►  VPS (<vps-tailscale-ip>)
     │                                                            │
     │ hooks POST to                                              │ Docker containers
     │ http://<vps-tailscale-ip>:4080/events                           │ - observability (port 4080)
     │                                                            │ - plane (port 80)
     │ browser opens                                              │ - openclaw (port 18789)
     │ http://<vps-tailscale-ip>:4080                                  │
```

- No public domain or TLS certificates needed — Tailscale encrypts all traffic
- No firewall ports need opening for dashboard access
- Access is limited to devices on your Tailscale network

### Docker Compose Configuration (current)

```yaml
# ~/observability/docker-compose.yml
services:
  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    restart: unless-stopped
    volumes:
      - db-data:/app/data

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
      args:
        VITE_API_URL: http://<vps-tailscale-ip>:4080
        VITE_WS_URL: ws://<vps-tailscale-ip>:4080/stream
    ports:
      - "4080:80"
    depends_on:
      - server
    restart: unless-stopped

volumes:
  db-data:
```

> **Note**: `VITE_API_URL` and `VITE_WS_URL` are baked into the Vue client at build time using the Tailscale IP. If the Tailscale IP changes, you must rebuild: `cd ~/observability && docker compose build web && docker compose up -d`.

### Mac Environment Variable (current)

```bash
OBSERVABILITY_SERVER_URL=http://<vps-tailscale-ip>:4080/events
```

This is set in `~/.zshrc`. Claude Code hooks read this to send events to the VPS.

### Events Are Flowing

The dashboard has real events from Claude Code sessions (session starts, tool uses, prompts). WebSocket connections are working for real-time updates.

### Known Issue: Large Event Payloads

The Caddy logs show some large POST requests to `/events` failing with "connection reset by peer" — these are events with payloads over ~100KB. This doesn't affect normal operation but means some large tool outputs may be lost.

---

## Setup Steps (completed)

### Step 1: Clone the Observability Repo

```bash
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>
cd ~
git clone https://github.com/disler/claude-code-hooks-multi-agent-observability.git observability
cd ~/observability
```

### Step 2: Configure Docker Compose for Tailscale

Updated `docker-compose.yml` build args to use Tailscale IP instead of a public domain:

```yaml
web:
  build:
    args:
      VITE_API_URL: http://<vps-tailscale-ip>:4080
      VITE_WS_URL: ws://<vps-tailscale-ip>:4080/stream
```

### Step 3: Build and Start

```bash
cd ~/observability
docker compose up -d --build
```

### Step 4: Install Tailscale on VPS

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

The VPS hostname in Tailscale is `<vps-hostname>`.

### Step 5: Install Tailscale on Mac

Installed Tailscale on Mac. The Mac hostname is `<mac-hostname>`.

Verified connectivity:

```bash
# From Mac
tailscale status
# Shows both devices connected

# Test dashboard access
curl http://<vps-tailscale-ip>:4080/events/recent
```

### Step 6: Configure Mac to Send Events

```bash
echo 'export OBSERVABILITY_SERVER_URL="http://<vps-tailscale-ip>:4080/events"' >> ~/.zshrc
source ~/.zshrc
```

---

## Verification Checklist

| Check | How | Expected | Status |
|-------|-----|----------|--------|
| Docker running | `docker compose ps` on VPS | 2 containers "Up" | Done |
| API responds | `curl http://localhost:4080/events/recent` on VPS | JSON array | Done |
| UI serves | `curl -s http://localhost:4080 \| head -1` on VPS | `<!DOCTYPE html>` | Done |
| Tailscale connected | `tailscale status` from Mac | Both devices listed, direct connection | Done |
| Dashboard accessible | Visit `http://<vps-tailscale-ip>:4080` from Mac browser | Dashboard loads | Done |
| WebSocket works | Browser DevTools → Network → WS | Connection established | Done |
| Env var set | `echo $OBSERVABILITY_SERVER_URL` on Mac | `http://<vps-tailscale-ip>:4080/events` | Done |
| Events flow | Start Claude Code session | Events appear in dashboard | Done |
| Persistence | `sudo reboot` on VPS, wait 2 min | Dashboard comes back (restart: unless-stopped) | To verify |

---

## Troubleshooting

**Dashboard not accessible from Mac:**
- Check Tailscale is connected: `tailscale status`
- Verify VPS Tailscale IP hasn't changed: `ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "tailscale ip -4"`
- If Tailscale IP changed, update `OBSERVABILITY_SERVER_URL` in `~/.zshrc` and rebuild the web container

**Dashboard shows no events:**
- Check `OBSERVABILITY_SERVER_URL` is set: `echo $OBSERVABILITY_SERVER_URL`
- Test connectivity: `curl -X POST http://<vps-tailscale-ip>:4080/events -H "Content-Type: application/json" -d '{"source_app":"test","session_id":"test","hook_event_type":"Test","payload":{},"timestamp":0}'`
- Check VPS logs: `ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose logs server --tail=20"`

**WebSocket not connecting (dashboard shows stale data):**
- Ensure `VITE_WS_URL` uses `ws://` (not `wss://`) since Tailscale handles encryption
- Check browser DevTools console for WebSocket errors
- Verify the Caddyfile proxies `/stream` to the server

**Large event payloads failing:**
- Some events with payloads >100KB fail with "connection reset by peer"
- This is a known issue — consider adding payload size limits in the hook scripts

**Docker build fails:**
- Check disk space: `df -h` (currently 12% used of 150GB)
- Clear old images: `docker system prune -f`
- Rebuild: `docker compose build --no-cache`

---

## Future Improvements

- **Tailscale Funnel**: Could expose the dashboard publicly via `tailscale funnel` if external access is needed later
- **Public domain access**: Could revisit Cloudflare Tunnel or Caddy + Let's Encrypt if a `dashboard.martondobos.com` domain is desired
- **Payload size limits**: Add max payload size to hook scripts to prevent the large event failures
- **Authentication**: The dashboard currently has no auth — anyone on the Tailscale network can access it

---

## Cost

| Item | Monthly |
|------|---------|
| Additional VPS resources | €0 (runs alongside Plane on existing server) |
| Tailscale | Free (personal plan) |
| **Total additional** | **€0** |

---

## Key Files

**On VPS (`ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>`):**
- `~/observability/docker-compose.yml` — Container configuration
- `~/observability/docker/Caddyfile` — Reverse proxy routing rules
- `~/observability/docker/Dockerfile.server` — Bun API server image
- `~/observability/docker/Dockerfile.web` — Vue client + Caddy image
- Docker volume `db-data` — SQLite database persistence

**On Mac:**
- `~/.zshrc` — Contains `OBSERVABILITY_SERVER_URL` export
- Project `.claude/hooks/` directories — Hook scripts that send events

---

## Quick Reference

```bash
# SSH into VPS
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>

# Check observability containers
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose ps"

# View server logs
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose logs server --tail=30"

# Rebuild after changes
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose up -d --build"

# Restart containers
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose restart"

# Access dashboard from Mac browser
open http://<vps-tailscale-ip>:4080

# Check Tailscale connectivity
tailscale status

# Test event submission
curl -X POST http://<vps-tailscale-ip>:4080/events \
  -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"test","hook_event_type":"Test","payload":{},"timestamp":0}'
```
