#!/bin/bash

set -e

echo "🚀 Cloudflare Developer Assistant - Automated Setup"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required. Current: $(node -v)${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Install dependencies (wrangler will be installed locally)
echo "📦 Installing dependencies (including wrangler locally)..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "Checking if wrangler is installed locally..."
    if [ ! -f "node_modules/.bin/wrangler" ]; then
        echo "Installing missing dependencies..."
        npm install
    else
        echo "Dependencies already installed, skipping..."
    fi
fi
echo -e "${GREEN}✅ Dependencies installed locally${NC}"
echo ""

# Helper function to run wrangler locally
WRANGLER_CMD="./node_modules/.bin/wrangler"
if [ ! -f "$WRANGLER_CMD" ]; then
    WRANGLER_CMD="npx wrangler"
fi

# Check Cloudflare login
echo "🔐 Checking Cloudflare authentication..."
if ! $WRANGLER_CMD whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare.${NC}"
    echo -e "${YELLOW}Note: Free Cloudflare accounts work fine for this project!${NC}"
    echo ""
    echo "Opening browser for authentication..."
    echo "This may take a moment - please complete the login in your browser."
    echo ""
    $WRANGLER_CMD login || {
        echo -e "${RED}❌ Login failed or was cancelled${NC}"
        echo "You can try running: $WRANGLER_CMD login"
        exit 1
    }
    echo ""
    echo -e "${GREEN}✅ Login successful!${NC}"
else
    echo -e "${GREEN}✅ Already authenticated${NC}"
    # Show account info
    echo "Account info:"
    $WRANGLER_CMD whoami 2>/dev/null | head -n 3 || true
fi
echo ""

# Get account ID if not set
if ! grep -q "^account_id" wrangler.toml 2>/dev/null; then
    echo "🔍 Getting Cloudflare account ID..."
    ACCOUNT_ID=$($WRANGLER_CMD whoami | grep "Account ID" | awk '{print $3}' || $WRANGLER_CMD whoami | grep -oP 'Account ID: \K[^\s]+' || echo "")
    
    if [ -z "$ACCOUNT_ID" ]; then
        echo -e "${YELLOW}⚠️  Could not auto-detect account ID. Please enter it manually:${NC}"
        read -p "Account ID: " ACCOUNT_ID
    fi
    
    if [ ! -z "$ACCOUNT_ID" ]; then
        # Add account_id to wrangler.toml
        if grep -q "^# account_id" wrangler.toml; then
            sed -i.bak "s/^# account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
        else
            # Insert after name line
            sed -i.bak "/^name =/a\\
account_id = \"$ACCOUNT_ID\"
" wrangler.toml
        fi
        echo -e "${GREEN}✅ Account ID added to wrangler.toml${NC}"
    fi
    echo ""
fi

# Check if Vectorize index exists
echo "🔍 Checking Vectorize index..."
INDEX_EXISTS=$($WRANGLER_CMD vectorize list 2>/dev/null | grep -q "cloudflare-docs" && echo "yes" || echo "no")

if [ "$INDEX_EXISTS" = "no" ]; then
    echo "📊 Creating Vectorize index..."
    echo -e "${YELLOW}Note: Vectorize is in beta and may require account verification${NC}"
    $WRANGLER_CMD vectorize create cloudflare-docs \
        --dimensions=768 \
        --metric=cosine || {
        echo -e "${YELLOW}⚠️  Vectorize creation failed. This might require:${NC}"
        echo "  1. Enabling Vectorize in your Cloudflare dashboard"
        echo "  2. Account verification (check your email)"
        echo "  3. Or Vectorize may not be available in your region yet"
        echo ""
        echo -e "${YELLOW}Continuing without Vectorize - RAG features won't work, but chat will still function.${NC}"
        echo ""
        read -p "Press Enter to continue anyway, or Ctrl+C to exit and enable Vectorize first..."
    }
    if [ "$INDEX_EXISTS" = "no" ] && $WRANGLER_CMD vectorize list 2>/dev/null | grep -q "cloudflare-docs"; then
        echo -e "${GREEN}✅ Vectorize index created${NC}"
    fi
else
    echo -e "${GREEN}✅ Vectorize index already exists${NC}"
fi
echo ""

# Deploy Worker
echo "🚀 Deploying Cloudflare Worker..."
echo -e "${YELLOW}Note: Workers AI (Llama 3.3) may require enabling in dashboard${NC}"
echo "If deployment fails with AI errors, enable Workers AI at:"
echo "https://dash.cloudflare.com -> Workers & Pages -> AI"
echo ""
npm run deploy || {
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "1. Check Workers AI is enabled in your dashboard"
    echo "2. Verify your account email if prompted"
    echo "3. Free accounts work, but some features may need activation"
    echo ""
    exit 1
}
echo -e "${GREEN}✅ Worker deployed${NC}"
echo ""

# Get worker URL from deployment output
WORKER_NAME=$(grep "^name = " wrangler.toml | cut -d'"' -f2)
WORKER_URL=""

# The deployment output shows the URL, but we need to extract it
# Look for the pattern: https://worker-name.subdomain.workers.dev in recent output
# Or extract subdomain from email
ACCOUNT_INFO=$($WRANGLER_CMD whoami 2>/dev/null | grep -i "email" | head -1 || echo "")
if echo "$ACCOUNT_INFO" | grep -q "@"; then
    EMAIL=$(echo "$ACCOUNT_INFO" | grep -oE '[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | head -1)
    if [ ! -z "$EMAIL" ]; then
        # Extract subdomain from email (e.g., munish.shah04@gmail.com -> munish-shah04)
        EMAIL_PART=$(echo "$EMAIL" | cut -d'@' -f1)
        ACCOUNT_SUBDOMAIN=$(echo "$EMAIL_PART" | sed 's/\./-/g')
        WORKER_URL="https://${WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
        echo "Auto-detected Worker URL: $WORKER_URL"
    fi
fi

# If we still don't have it, ask the user
if [ -z "$WORKER_URL" ]; then
    echo ""
    echo -e "${YELLOW}📝 Please enter your account subdomain${NC}"
    echo "From the deployment output above, your worker URL is shown."
    echo "Example: If URL is 'https://cf-ai-developer-assistant.munish-shah04.workers.dev'"
    echo "         Then subdomain is: munish-shah04"
    echo ""
    read -p "Enter subdomain (or full URL, or press Enter to skip): " USER_INPUT
    
    if [ -z "$USER_INPUT" ]; then
        WORKER_URL=""
        echo -e "${YELLOW}⚠️  Skipping Vectorize population. You can do it manually later.${NC}"
    else
        # If user entered a full URL, extract the subdomain
        if echo "$USER_INPUT" | grep -q "workers.dev"; then
            # Extract subdomain from full URL: https://worker-name.SUBDOMAIN.workers.dev
            ACCOUNT_SUBDOMAIN=$(echo "$USER_INPUT" | sed -n 's|https://[^.]*\.\([^.]*\)\.workers\.dev|\1|p')
            if [ ! -z "$ACCOUNT_SUBDOMAIN" ]; then
                WORKER_URL="https://${WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
            else
                WORKER_URL="$USER_INPUT"
            fi
        elif echo "$USER_INPUT" | grep -q "^https://"; then
            # User entered a URL but not workers.dev format, use as-is
            WORKER_URL="$USER_INPUT"
        else
            # User entered just the subdomain
            WORKER_URL="https://${WORKER_NAME}.${USER_INPUT}.workers.dev"
        fi
        echo "Using Worker URL: $WORKER_URL"
    fi
fi

# Populate Vectorize
if [ ! -z "$WORKER_URL" ]; then
    echo "📚 Populating Vectorize index with documentation..."
    echo "This may take a minute..."

    # Wait a bit for deployment to be fully ready
    sleep 5

    POPULATE_RESPONSE=$(curl -s -X POST "${WORKER_URL}/populate" 2>&1 || echo "error")

    if echo "$POPULATE_RESPONSE" | grep -q "success\|populated"; then
        echo -e "${GREEN}✅ Vectorize index populated${NC}"
    else
        echo -e "${YELLOW}⚠️  Vectorize population may have failed.${NC}"
        echo "Response: $POPULATE_RESPONSE"
        echo "You can manually populate later with: curl -X POST ${WORKER_URL}/populate"
    fi
    echo ""
fi

# Start frontend
echo "🎨 Starting frontend development server..."
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Frontend will be available at: http://localhost:8788"
if [ ! -z "$WORKER_URL" ]; then
    echo "Worker is deployed at: $WORKER_URL"
fi
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the dev server${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Start the dev server (this will block)
npm run pages:dev

