# Phase 2: VPS Setup + Plane Deployment

## Context

You're implementing Phase 2 of the Agent HQ plan — deploying a self-hosted Plane instance for kanban task management with Claude Code MCP integration. You need a VPS provisioned from scratch on Hetzner, with your domain managed on Vercel.

---

## Step 1: Provision Hetzner VPS

### 1.1 Create Hetzner account
- Sign up at https://accounts.hetzner.com/signUp
- Add payment method (credit card or PayPal)

### 1.2 Generate SSH key (on your Mac, if you don't have one)
```bash
ssh-keygen -t ed25519 -C "your-email" -f ~/.ssh/hetzner_ed25519
```

### 1.3 Create the server
In Hetzner Cloud Console (https://console.hetzner.cloud):

1. Create a new project (e.g., "claude-hq")
2. Upload your SSH public key under **Security > SSH Keys**
3. Create a server with these settings:

| Setting | Value |
|---------|-------|
| Location | Falkenstein (fsn1) — cheapest EU |
| Image | Ubuntu 24.04 |
| Type | **CPX32** (4 vCPU, 8GB RAM, ~13.32 EUR/mo) |
| SSH Key | Select your uploaded key |
| Name | `<your-server-name>` |

> **Why CPX32 over CPX22?** Plane alone uses ~3GB RAM. You'll also run an observability dashboard + Telegram bot later. CPX22 (4GB) will OOM; CPX32 (8GB) gives headroom.

### 1.4 Note your server IP
Write down the IPv4 address from the server details page.

---

## Step 2: Harden the VPS

SSH in:
```bash
ssh -i ~/.ssh/hetzner_ed25519 root@<SERVER_IP>
```

### 2.1 Update system
```bash
apt update && apt upgrade -y
```

### 2.2 Create non-root user
```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 2.3 Lock down SSH
Edit `/etc/ssh/sshd_config`:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers deploy
```
Then: `systemctl restart ssh`

**Before closing this session**, verify in a new terminal:
```bash
ssh -i ~/.ssh/hetzner_ed25519 deploy@<SERVER_IP>
```

### 2.4 Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2.5 fail2ban
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```

Create `/etc/fail2ban/jail.local`:
```ini
[sshd]
enabled = true
port = 22
maxretry = 3
bantime = 3600
findtime = 600
```
Then: `sudo systemctl restart fail2ban`

### 2.6 Auto security updates
```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Step 3: Install Docker

As the `deploy` user:

```bash
# Prerequisites
sudo apt install -y ca-certificates curl gnupg

# Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker deploy
newgrp docker

# Verify
docker run hello-world
```

---

## Step 4: Deploy Plane

### 4.1 Download and run setup script
```bash
mkdir -p ~/plane-selfhost && cd ~/plane-selfhost
curl -fsSL -o setup.sh https://github.com/makeplane/plane/releases/latest/download/setup.sh
chmod +x setup.sh
./setup.sh
# Select 1) Install
```

### 4.2 Configure `plane.env`
After install, edit `~/plane-selfhost/plane.env`:
```env
WEB_URL=http://plane.yourdomain.com
CORS_ALLOWED_ORIGINS=http://plane.yourdomain.com
```

> **Note**: Keep `LISTEN_HTTP_PORT=80` (the default). Plane ships with its own Caddy-based reverse proxy (`plane-app-proxy-1`) that handles port 80. Do NOT install a separate Caddy/Nginx in front — it conflicts with Plane's proxy container and prevents port binding.

### 4.3 Start Plane
```bash
cd ~/plane-selfhost
./setup.sh
# Select 2) Start
```

First run pulls ~2-4 GB of Docker images. Wait several minutes.

---

## Step 5: DNS (Vercel)

Since your domain is on Vercel, add an A record:

1. Go to Vercel Dashboard > your domain > DNS Settings
2. Add record:
   - **Type**: A
   - **Name**: `plane`
   - **Value**: `<SERVER_IP>`
   - **TTL**: 60

DNS propagates within minutes (Vercel uses 60s TTL).

> **Later**: You'll add more subdomains for the observability dashboard (e.g., `dashboard.yourdomain.com`) the same way.

---

## Step 6: Plane Initial Setup

1. Open `http://plane.yourdomain.com` in browser
2. Create admin account
3. Create a **Workspace** (e.g., "My Projects")
4. Create **projects** — one per GitHub repo
5. Set up Kanban views with columns: `Backlog > Todo > In Progress > In Review > Done`
6. Generate API token: **Settings > Workspace > API Tokens** — save it securely

---

## Step 7: Connect Plane MCP to Claude Code (on your Mac)

```bash
claude mcp add plane \
  -e PLANE_API_KEY="your-api-key-here" \
  -e PLANE_WORKSPACE_SLUG="your-workspace-slug" \
  -e PLANE_BASE_URL="http://plane.yourdomain.com" \
  -- uvx plane-mcp-server stdio
```

Requires Python 3.10+ and `uvx` on your Mac (`pip install uv` if needed).

Verify: launch Claude Code and run `/mcp` — should show `plane: connected`.

---

## Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| SSH works | `ssh deploy@<IP>` from Mac | Login succeeds |
| Root blocked | `ssh root@<IP>` | Permission denied |
| Firewall | `sudo ufw status` on VPS | 22, 80, 443 allowed |
| Docker | `docker ps` on VPS | 10+ Plane containers "Up" |
| DNS | `dig plane.yourdomain.com` from Mac | Returns VPS IP |
| HTTP | Visit `http://plane.yourdomain.com` | Plane login page |
| Plane API | Create a test issue in Plane UI | Issue appears on board |
| MCP | `/mcp` in Claude Code | `plane: connected` |
| MCP works | Ask Claude to list projects | Returns your workspace projects |

---

## Cost

| Item | Monthly |
|------|---------|
| Hetzner CPX32 | ~13.32 EUR |
| Domain (already owned) | 0 |
| SSL (not yet configured) | 0 |
| **Total** | **~13.32 EUR/mo** |

---

## Key Files on VPS

- `~/plane-selfhost/plane.env` — Plane configuration (URLs, ports, secrets)
- `~/plane-selfhost/plane-app/docker-compose.yaml` — Container definitions (managed by setup.sh)
- Plane's built-in proxy container handles reverse proxying (no external Caddy/Nginx needed)
- `/etc/ssh/sshd_config` — SSH hardening
- `/etc/fail2ban/jail.local` — Brute-force protection
