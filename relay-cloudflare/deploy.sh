#!/bin/bash

# OpenClaw Chrome Relay Deployment Script
set -e

echo "🚀 Deploying OpenClaw Chrome Relay to Cloudflare Workers..."

# Check if required tools are available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Generate types
echo "🔧 Generating TypeScript types..."
npx wrangler types --env-interface CloudflareBindings worker-configuration.d.ts

# Check if D1 database exists
echo "🗃️ Checking D1 database..."
if ! npx wrangler d1 list | grep -q "openclaw-relay"; then
    echo "❌ D1 database 'openclaw-relay' not found."
    echo "Please create it first with: npx wrangler d1 create openclaw-relay"
    echo "Then update the database_id in wrangler.toml"
    exit 1
fi

# Run database migrations
echo "🔄 Running database migrations..."
npx wrangler d1 migrations apply openclaw-relay --remote

# Check if required secrets are set
echo "🔐 Checking secrets..."
secrets_missing=false

if ! npx wrangler secret list | grep -q "JWT_SECRET"; then
    echo "❌ Missing secret: JWT_SECRET"
    secrets_missing=true
fi

if [ "$secrets_missing" = true ]; then
    echo ""
    echo "Please set missing secrets:"
    echo "  npx wrangler secret put JWT_SECRET"
    exit 1
fi

# Deploy to Cloudflare Workers
echo "🌍 Deploying to Cloudflare Workers..."
npx wrangler deploy

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "Your relay is now available at:"
npx wrangler whoami | grep "Account ID" && echo "Check your Cloudflare dashboard for the worker URL"
echo ""
echo "Next steps:"
echo "1. Test the health endpoint: curl https://your-worker-url/health"
echo "2. Configure each agent connector with AGENT_ID + AGENT_SECRET for this relay URL"
echo "3. Install the Chrome extension and pair with your agent"