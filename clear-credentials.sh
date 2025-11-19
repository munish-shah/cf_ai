#!/bin/bash

# Script to clear all credentials and cached data for testing
# This simulates a fresh install for a new user

echo "🧹 Clearing all credentials and cached data..."
echo ""

# Remove account_id from wrangler.toml
if grep -q "^account_id = \"" wrangler.toml 2>/dev/null; then
    echo "Removing account_id from wrangler.toml..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' '/^account_id = /d' wrangler.toml
        # Add back the commented placeholder
        if ! grep -q "^# account_id" wrangler.toml; then
            sed -i '' '/^# Add your Cloudflare account ID/a\
# account_id = "your-account-id"
' wrangler.toml
        fi
    else
        sed -i '/^account_id = /d' wrangler.toml
        if ! grep -q "^# account_id" wrangler.toml; then
            sed -i '/^# Add your Cloudflare account ID/a\
# account_id = "your-account-id"
' wrangler.toml
        fi
    fi
    echo "✅ Removed account_id from wrangler.toml"
fi

# Clear .wrangler cache
if [ -d ".wrangler" ]; then
    echo "Removing .wrangler cache directory..."
    rm -rf .wrangler
    echo "✅ Removed .wrangler cache"
fi

# Clear node_modules (optional - uncomment if you want a completely fresh install)
# if [ -d "node_modules" ]; then
#     echo "Removing node_modules..."
#     rm -rf node_modules package-lock.json
#     echo "✅ Removed node_modules"
# fi

echo ""
echo "✅ All credentials cleared!"
echo ""
echo "Note: Your global Cloudflare authentication (wrangler login) is still active."
echo "To test as a completely new user (no login), you can also run:"
echo "  ./node_modules/.bin/wrangler logout"
echo "  # or: npx wrangler logout"
echo ""
echo "To clear everything including dependencies for a completely fresh start:"
echo "  rm -rf node_modules package-lock.json .wrangler"
echo "  # Then edit wrangler.toml to remove account_id (already done)"

