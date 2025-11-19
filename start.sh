#!/bin/bash

# Don't exit on error immediately - we want to handle Node.js version issues gracefully
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

# Function to load nvm
load_nvm() {
    # Try to find and load nvm from common locations
    NVM_PATHS=(
        "$HOME/.nvm/nvm.sh"
        "$HOME/.config/nvm/nvm.sh"
        "/usr/local/opt/nvm/nvm.sh"
    )
    
    for NVM_PATH in "${NVM_PATHS[@]}"; do
        if [ -s "$NVM_PATH" ]; then
            export NVM_DIR="$(dirname "$NVM_PATH")"
            [ -s "$NVM_PATH" ] && \. "$NVM_PATH"
            return 0
        fi
    done
    
    # Also try sourcing from profile files if nvm command isn't available
    if ! command -v nvm &> /dev/null 2>&1; then
        if [ -s "$HOME/.bashrc" ]; then
            source "$HOME/.bashrc" 2>/dev/null || true
        fi
        if [ -s "$HOME/.zshrc" ]; then
            source "$HOME/.zshrc" 2>/dev/null || true
        fi
        if [ -s "$HOME/.profile" ]; then
            source "$HOME/.profile" 2>/dev/null || true
        fi
    fi
    
    return 0
}

# Function to setup Node.js version from .nvmrc (virtual environment style)
setup_node_version() {
    # Load nvm first
    load_nvm
    
    # Check if .nvmrc exists (project-specific Node version)
    if [ -f ".nvmrc" ]; then
        REQUIRED_VERSION=$(cat .nvmrc | tr -d '[:space:]')
        echo "Found .nvmrc file specifying Node.js version: $REQUIRED_VERSION"
        
        if command -v nvm &> /dev/null || type nvm &> /dev/null 2>&1; then
            echo "Installing/using Node.js $REQUIRED_VERSION from .nvmrc..."
            nvm install "$REQUIRED_VERSION" --latest-npm 2>&1 || {
                echo "Node $REQUIRED_VERSION may already be installed, switching..."
            }
            nvm use "$REQUIRED_VERSION" 2>&1
            echo -e "${GREEN}✅ Activated Node.js $(node -v) from .nvmrc (project virtual environment)${NC}"
            return 0
        fi
    else
        # Fallback: use Node 20 if no .nvmrc
        if command -v nvm &> /dev/null || type nvm &> /dev/null 2>&1; then
            echo "No .nvmrc found, installing Node.js 20..."
            nvm install 20 --latest-npm 2>&1 || {
                echo "Node 20 may already be installed, switching..."
                nvm use 20 2>&1 || return 1
            }
            nvm use 20 2>&1
            echo -e "${GREEN}✅ Activated Node.js $(node -v)${NC}"
            return 0
        fi
    fi
    
    return 1
}

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js is not installed.${NC}"
    echo "Attempting to install Node.js 20 using nvm..."
    
    if setup_node_version; then
        # Verify node is now available
        if command -v node &> /dev/null; then
            echo -e "${GREEN}✅ Node.js installed successfully: $(node -v)${NC}"
        else
            echo -e "${YELLOW}⚠️  Node.js installed but not in PATH. Reloading shell...${NC}"
            # Try to reload the shell environment
            exec "$SHELL" -c "$0 $*"
        fi
    else
        echo -e "${RED}❌ Could not install Node.js automatically.${NC}"
        echo ""
        echo "Please install Node.js 20+ manually:"
        echo "  1. Install nvm (if not installed):"
        echo "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        echo "  2. Reload your shell: source ~/.bashrc (or ~/.zshrc)"
        echo "  3. Install Node 20: nvm install 20 && nvm use 20"
        echo "  4. Or download from: https://nodejs.org/"
        exit 1
    fi
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}⚠️  Node.js version 20+ required. Current: $(node -v)${NC}"
    echo "Attempting to switch to Node.js 20 using nvm..."
    
    if setup_node_version; then
        # Verify the switch worked
        if command -v node &> /dev/null; then
            NEW_NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
            if [ "$NEW_NODE_VERSION" -ge 20 ]; then
                echo -e "${GREEN}✅ Switched to Node.js $(node -v)${NC}"
            else
                echo -e "${YELLOW}⚠️  Node version still $(node -v). Reloading shell environment...${NC}"
                # The nvm use command might need a new shell session
                echo "Please run this script again, or manually run: nvm use 20"
                exit 1
            fi
        else
            echo -e "${RED}❌ Node.js command not found after nvm setup${NC}"
            exit 1
        fi
    else
        echo -e "${RED}❌ Could not automatically switch Node.js version.${NC}"
        echo ""
        echo "Please update Node.js to version 20 or higher:"
        echo "  - If you have nvm: nvm install 20 && nvm use 20"
        echo "  - Then run this script again"
        echo "  - Or download from: https://nodejs.org/"
        exit 1
    fi
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed.${NC}"
    echo "npm should come with Node.js. Please reinstall Node.js."
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed (Node.js $(node -v), npm $(npm -v))${NC}"
echo ""

# Install dependencies in virtual environment (local node_modules)
echo "📦 Installing dependencies in project virtual environment..."
echo "This ensures a clean, isolated installation (Node.js equivalent of Python venv)..."
if [ -d "node_modules" ]; then
    echo "Removing existing node_modules for fresh install..."
    rm -rf node_modules package-lock.json
fi

# Ensure we're using the correct Node version from .nvmrc (virtual environment activation)
if [ -f ".nvmrc" ] && load_nvm; then
    if command -v nvm &> /dev/null || type nvm &> /dev/null 2>&1; then
        REQUIRED_VERSION=$(cat .nvmrc | tr -d '[:space:]')
        echo "Activating Node.js $REQUIRED_VERSION from .nvmrc (project virtual environment)..."
        nvm use "$REQUIRED_VERSION" 2>&1 || true
    fi
fi

# Install dependencies locally (virtual environment style - isolated from global packages)
echo "Installing packages (this may take a minute)..."
npm install
# Verify installation succeeded
if [ ! -f "node_modules/.bin/wrangler" ] && [ ! -d "node_modules/wrangler" ]; then
    echo -e "${RED}❌ Installation failed. Please check your internet connection and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencies installed in project virtual environment (node_modules/)${NC}"
echo ""

# Helper function to run wrangler from virtual environment (local node_modules)
# This ensures we use the project's isolated dependencies, not global ones
WRANGLER_CMD="./node_modules/.bin/wrangler"
if [ ! -f "$WRANGLER_CMD" ]; then
    # Fallback to npx which uses local node_modules first
    WRANGLER_CMD="npx --yes wrangler"
fi

# Ensure local node_modules/.bin is in PATH (virtual environment activation)
export PATH="./node_modules/.bin:$PATH"

# Check Cloudflare login
echo "🔐 Checking Cloudflare authentication..."
# Check authentication status - wrangler whoami returns 0 even when not authenticated, so check output carefully
WHOAMI_CHECK=$($WRANGLER_CMD whoami 2>&1)
WHOAMI_EXIT=$?

# Check if actually authenticated - look for "not authenticated" message (wrangler returns 0 but says "not authenticated")
IS_AUTHENTICATED=true
if echo "$WHOAMI_CHECK" | grep -qi "not authenticated\|please run.*login\|you are not authenticated"; then
    IS_AUTHENTICATED=false
fi
# Also check exit code as backup
if [ $WHOAMI_EXIT -ne 0 ]; then
    IS_AUTHENTICATED=false
fi

if [ "$IS_AUTHENTICATED" = "false" ]; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare.${NC}"
    echo -e "${YELLOW}Note: Free Cloudflare accounts work fine for this project!${NC}"
    echo ""
    echo "Opening browser for authentication..."
    echo "This may take a moment - please complete the login in your browser."
    echo ""
    echo "If the browser doesn't open automatically, you can:"
    echo "  1. Check the terminal for a login URL"
    echo "  2. Or manually run: $WRANGLER_CMD login"
    echo ""
    
    # Run login command - this should open browser automatically
    LOGIN_OUTPUT=$($WRANGLER_CMD login 2>&1)
    LOGIN_EXIT=$?
    
    if [ $LOGIN_EXIT -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Login successful!${NC}"
        # Verify login worked
        if $WRANGLER_CMD whoami &> /dev/null; then
            echo "Verified: Authentication confirmed"
        fi
    else
        echo ""
        echo -e "${RED}❌ Login failed or was cancelled${NC}"
        echo "Login output: $LOGIN_OUTPUT"
        echo ""
        echo "You can try running manually:"
        echo "  $WRANGLER_CMD login"
        echo ""
        echo "Or if you're having issues, check:"
        echo "  - Your internet connection"
        echo "  - That your browser can open"
        echo "  - Cloudflare dashboard is accessible"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Already authenticated${NC}"
    # Show account info
    echo "Account info:"
    echo "$WHOAMI_CHECK" | head -n 3 || true
fi
echo ""

# Get account ID if not set (check for both commented and uncommented)
# Also check if existing account_id is valid (32 hex chars)
EXISTING_ACCOUNT_ID=$(grep "^account_id = \"" wrangler.toml 2>/dev/null | sed 's/.*account_id = "\([^"]*\)".*/\1/' | head -1)
if [ ! -z "$EXISTING_ACCOUNT_ID" ] && echo "$EXISTING_ACCOUNT_ID" | grep -qE '^[a-f0-9]{32}$'; then
    echo -e "${GREEN}✅ Valid account ID already set in wrangler.toml${NC}"
else
    # Clean up invalid account_id if present
    if [ ! -z "$EXISTING_ACCOUNT_ID" ]; then
        echo -e "${YELLOW}⚠️  Invalid account ID found in wrangler.toml, will replace it${NC}"
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' '/^account_id = /d' wrangler.toml
        else
            sed -i '/^account_id = /d' wrangler.toml
        fi
    fi
    
    echo "🔍 Getting Cloudflare account ID..."
    # Try multiple methods to get account ID, but validate it's a 32-char hex string
    # Method 1: Try to get from wrangler whoami (may include account info)
    WHOAMI_OUTPUT=$($WRANGLER_CMD whoami 2>&1)
    ACCOUNT_ID=$(echo "$WHOAMI_OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1)
    
    # Method 2: Check wrangler config file (if it exists)
    if [ -z "$ACCOUNT_ID" ]; then
        WRANGLER_CONFIG="$HOME/.wrangler/config/default.toml"
        if [ -f "$WRANGLER_CONFIG" ]; then
            ACCOUNT_ID=$(grep -oE 'account_id\s*=\s*"[a-f0-9]{32}"' "$WRANGLER_CONFIG" 2>/dev/null | grep -oE '[a-f0-9]{32}' | head -1)
        fi
    fi
    
    # Method 3: Try to get from Cloudflare API (list accounts)
    if [ -z "$ACCOUNT_ID" ]; then
        # Try using wrangler to get account info via API
        API_OUTPUT=$($WRANGLER_CMD whoami --json 2>/dev/null || echo "")
        if [ ! -z "$API_OUTPUT" ]; then
            # Try to extract account ID from JSON (if whoami supports --json)
            ACCOUNT_ID=$(echo "$API_OUTPUT" | grep -oE '"account_id"\s*:\s*"[a-f0-9]{32}"' | grep -oE '[a-f0-9]{32}' | head -1)
            # Or try to get from account list
            if [ -z "$ACCOUNT_ID" ]; then
                ACCOUNT_ID=$(echo "$API_OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1)
            fi
        fi
    fi
    
    # Method 4: Will be extracted from Vectorize error or deployment output if needed
    # (This happens later in the script)
    
    # Validate account ID format (must be exactly 32 hex characters)
    if [ ! -z "$ACCOUNT_ID" ] && echo "$ACCOUNT_ID" | grep -qE '^[a-f0-9]{32}$'; then
        echo -e "${GREEN}✅ Valid account ID detected: ${ACCOUNT_ID:0:8}...${ACCOUNT_ID:24}${NC}"
    else
        ACCOUNT_ID=""
        echo -e "${YELLOW}⚠️  Could not auto-detect account ID from whoami.${NC}"
        echo "This is OK - we'll try to extract it from deployment or Vectorize operations."
        echo "If those fail, wrangler will use your authenticated session automatically."
        echo ""
        echo "Note: account_id in wrangler.toml is optional - wrangler can get it from your authenticated session."
        echo "You can also find your account ID in:"
        echo "  - Cloudflare Dashboard -> Right sidebar"
        echo "  - Or it will be shown in deployment output"
    fi
    
    if [ ! -z "$ACCOUNT_ID" ] && echo "$ACCOUNT_ID" | grep -qE '^[a-f0-9]{32}$'; then
        # Validate account ID is 32 hex chars before writing
        # Add account_id to wrangler.toml
        if grep -q "^# account_id" wrangler.toml; then
            # Replace commented line with actual account_id
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^# account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
            else
                sed -i "s/^# account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
            fi
        elif grep -q "^account_id = \"your-account-id\"" wrangler.toml; then
            # Replace placeholder with actual account_id
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^account_id = \"your-account-id\"/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
            else
                sed -i "s/^account_id = \"your-account-id\"/account_id = \"$ACCOUNT_ID\"/" wrangler.toml
            fi
        else
            # Insert after name line (macOS compatible)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "/^name =/a\\
account_id = \"$ACCOUNT_ID\"
" wrangler.toml
            else
                sed -i "/^name =/a\\
account_id = \"$ACCOUNT_ID\"
" wrangler.toml
            fi
        fi
        echo -e "${GREEN}✅ Account ID added to wrangler.toml${NC}"
    elif [ ! -z "$ACCOUNT_ID" ]; then
        echo -e "${RED}❌ Invalid account ID format detected. Skipping auto-configuration.${NC}"
        echo "Please manually set account_id in wrangler.toml with a valid 32-character hex string"
    fi
    echo ""
fi

# Check if Vectorize index exists
echo "🔍 Checking Vectorize index..."
# Try to list indexes - if command fails, we'll try to create and handle errors
VECTORIZE_LIST_OUTPUT=$($WRANGLER_CMD vectorize list 2>&1)
if echo "$VECTORIZE_LIST_OUTPUT" | grep -q "cloudflare-docs"; then
    INDEX_EXISTS="yes"
    echo -e "${GREEN}✅ Vectorize index 'cloudflare-docs' found${NC}"
else
    INDEX_EXISTS="no"
fi

if [ "$INDEX_EXISTS" = "no" ]; then
    echo "📊 Creating Vectorize index..."
    echo -e "${YELLOW}Note: Vectorize is in beta and may require account verification${NC}"
    VECTORIZE_OUTPUT=$($WRANGLER_CMD vectorize create cloudflare-docs \
        --dimensions=768 \
        --metric=cosine 2>&1)
    VECTORIZE_EXIT=$?
    
    # Check if creation succeeded or if index already exists (both are fine)
    if [ $VECTORIZE_EXIT -eq 0 ]; then
        echo -e "${GREEN}✅ Vectorize index created${NC}"
        INDEX_EXISTS="yes"
    elif echo "$VECTORIZE_OUTPUT" | grep -qi "duplicate_name\|already exists\|index.*exists\|3002"; then
        # Index already exists - this is fine! RAG will work.
        echo -e "${GREEN}✅ Vectorize index already exists - RAG will work!${NC}"
        INDEX_EXISTS="yes"
        # Verify it actually exists
        if $WRANGLER_CMD vectorize list 2>/dev/null | grep -q "cloudflare-docs"; then
            echo "Verified: cloudflare-docs index is available and ready for RAG"
        fi
    else
        # Try to extract account ID from error message if we don't have it yet
        if [ -z "$ACCOUNT_ID" ]; then
            EXTRACTED_ID=$(echo "$VECTORIZE_OUTPUT" | grep -oE '/accounts/[a-f0-9]{32}/' | grep -oE '[a-f0-9]{32}' | head -1)
            if [ ! -z "$EXTRACTED_ID" ] && echo "$EXTRACTED_ID" | grep -qE '^[a-f0-9]{32}$'; then
                ACCOUNT_ID="$EXTRACTED_ID"
                echo "Extracted account ID from Vectorize error: ${ACCOUNT_ID:0:8}..."
                # Add it to wrangler.toml
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sed -i '' "s/^# account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml 2>/dev/null || \
                    sed -i '' "/^name =/a\\
account_id = \"$ACCOUNT_ID\"
" wrangler.toml
                else
                    sed -i "s/^# account_id = .*/account_id = \"$ACCOUNT_ID\"/" wrangler.toml 2>/dev/null || \
                    sed -i "/^name =/a\\
account_id = \"$ACCOUNT_ID\"
" wrangler.toml
                fi
                echo -e "${GREEN}✅ Account ID added to wrangler.toml${NC}"
            fi
        fi
        
        # Check one more time if index exists (maybe it was created despite the error)
        INDEX_EXISTS=$($WRANGLER_CMD vectorize list 2>/dev/null | grep -q "cloudflare-docs" && echo "yes" || echo "no")
        if [ "$INDEX_EXISTS" = "yes" ]; then
            echo -e "${GREEN}✅ Vectorize index exists - RAG will work!${NC}"
        else
            echo -e "${RED}❌ Vectorize creation failed and index does not exist.${NC}"
            echo "This might require:"
            echo "  1. Enabling Vectorize in your Cloudflare dashboard"
            echo "  2. Account verification (check your email)"
            echo "  3. Or Vectorize may not be available in your region yet"
            echo ""
            echo -e "${RED}⚠️  WARNING: RAG features will NOT work without Vectorize!${NC}"
            echo "You can create the index manually later with:"
            echo "  $WRANGLER_CMD vectorize create cloudflare-docs --dimensions=768 --metric=cosine"
            echo ""
        fi
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

# Capture deployment output to extract worker URL
DEPLOY_OUTPUT=$(npm run deploy 2>&1)
DEPLOY_EXIT=$?

if [ $DEPLOY_EXIT -ne 0 ]; then
    echo "$DEPLOY_OUTPUT"
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "1. Check Workers AI is enabled in your dashboard"
    echo "2. Verify your account email if prompted"
    echo "3. Free accounts work, but some features may need activation"
    echo "4. Ensure account_id is set in wrangler.toml"
    echo ""
    exit 1
fi

echo "$DEPLOY_OUTPUT"
echo -e "${GREEN}✅ Worker deployed${NC}"
echo ""

# Get worker URL from deployment output
WORKER_NAME=$(grep "^name = " wrangler.toml | cut -d'"' -f2)
WORKER_URL=""

# Try to extract URL from deployment output
if echo "$DEPLOY_OUTPUT" | grep -q "https://.*\.workers\.dev"; then
    WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE "https://[^[:space:]]+\.workers\.dev" | head -1)
    echo "Auto-detected Worker URL from deployment: $WORKER_URL"
fi

# Fallback: extract subdomain from email
if [ -z "$WORKER_URL" ]; then
    ACCOUNT_INFO=$($WRANGLER_CMD whoami 2>/dev/null | grep -i "email" | head -1 || echo "")
    if echo "$ACCOUNT_INFO" | grep -q "@"; then
        EMAIL=$(echo "$ACCOUNT_INFO" | grep -oE '[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | head -1)
        if [ ! -z "$EMAIL" ]; then
            # Extract subdomain from email (e.g., munish.shah04@gmail.com -> munish-shah04)
            EMAIL_PART=$(echo "$EMAIL" | cut -d'@' -f1)
            ACCOUNT_SUBDOMAIN=$(echo "$EMAIL_PART" | sed 's/\./-/g')
            WORKER_URL="https://${WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
            echo "Auto-detected Worker URL from email: $WORKER_URL"
        fi
    fi
fi

# If still no URL, try to construct from account subdomain pattern
if [ -z "$WORKER_URL" ]; then
    # Try to get subdomain from account info
    SUBDOMAIN=$($WRANGLER_CMD whoami 2>/dev/null | grep -i "subdomain\|account" | grep -oE '[a-zA-Z0-9_-]+' | head -1 || echo "")
    if [ ! -z "$SUBDOMAIN" ] && [ "$SUBDOMAIN" != "Account" ] && [ "$SUBDOMAIN" != "ID" ]; then
        WORKER_URL="https://${WORKER_NAME}.${SUBDOMAIN}.workers.dev"
        echo "Auto-detected Worker URL from subdomain: $WORKER_URL"
    fi
fi

# Last resort: skip Vectorize population but continue
if [ -z "$WORKER_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not auto-detect Worker URL.${NC}"
    echo "Vectorize population will be skipped. You can populate manually after finding your Worker URL:"
    echo "  curl -X POST https://YOUR-WORKER-URL.workers.dev/populate"
    echo ""
fi

# Populate Vectorize (CRITICAL for RAG to work)
if [ "$INDEX_EXISTS" = "yes" ] && [ ! -z "$WORKER_URL" ]; then
    echo "📚 Populating Vectorize index with documentation..."
    echo "This is required for RAG features to work..."
    echo "This may take a minute..."

    # Wait a bit for deployment to be fully ready
    sleep 5

    POPULATE_RESPONSE=$(curl -s -X POST "${WORKER_URL}/populate" 2>&1 || echo "error")

    if echo "$POPULATE_RESPONSE" | grep -q "success\|populated"; then
        echo -e "${GREEN}✅ Vectorize index populated - RAG is now functional!${NC}"
    else
        echo -e "${YELLOW}⚠️  Vectorize population may have failed.${NC}"
        echo "Response: $POPULATE_RESPONSE"
        echo ""
        echo -e "${RED}⚠️  WARNING: RAG features will not work without populated Vectorize index!${NC}"
        echo "You can manually populate later with:"
        echo "  curl -X POST ${WORKER_URL}/populate"
        echo ""
        echo "Or try again after the worker is fully ready."
    fi
    echo ""
elif [ "$INDEX_EXISTS" != "yes" ]; then
    echo -e "${RED}⚠️  WARNING: Vectorize index does not exist. RAG features will not work!${NC}"
    echo "The script will continue, but documentation search will be unavailable."
    echo ""
elif [ -z "$WORKER_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not populate Vectorize - Worker URL not detected.${NC}"
    echo "RAG features may not work. You can populate manually after finding your Worker URL."
    echo ""
fi

# Start frontend
echo "🎨 Starting frontend development server..."
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Frontend will be available at: http://localhost:8788"
echo "(Note: If port 8788 is in use, Wrangler will use the next available port - check the output above)"
if [ ! -z "$WORKER_URL" ]; then
    echo "Worker is deployed at: $WORKER_URL"
fi
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the dev server${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Start the dev server (this will block)
npm run pages:dev

