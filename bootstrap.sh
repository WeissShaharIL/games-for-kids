#!/bin/bash
set -e

echo "🚀 Bootstrapping server..."

# Update system
echo "📦 Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
echo "🐳 Installing Docker Compose..."
apt-get install -y docker-compose-plugin

# Enable Docker on startup
systemctl enable docker
systemctl start docker

# Install useful tools
echo "🔧 Installing utilities..."
apt-get install -y \
  git \
  curl \
  wget \
  htop \
  ufw

# Setup firewall
echo "🔒 Configuring firewall..."
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "✅ Bootstrap complete!"
echo ""
echo "Docker version:         $(docker --version)"
echo "Docker Compose version: $(docker compose version)"
echo "Git version:            $(git --version)"
echo ""
echo "Firewall status:"
ufw status