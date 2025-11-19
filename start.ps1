# Cloudflare Developer Assistant - Automated Setup (Windows)
# PowerShell script for Windows users

Write-Host "🚀 Cloudflare Developer Assistant - Automated Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  Node.js is not installed." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please install Node.js 20+ manually:"
    Write-Host "  1. Download from: https://nodejs.org/"
    Write-Host "  2. Or use nvm-windows: https://github.com/coreybutler/nvm-windows"
    Write-Host "  3. After installation, restart this script"
    exit 1
}

# Check Node.js version
$nodeVersion = (node -v).Substring(1) -replace '^(\d+)\..*', '$1'
if ([int]$nodeVersion -lt 20) {
    Write-Host "⚠️  Node.js version 20+ required. Current: $(node -v)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please update Node.js to version 20 or higher:"
    Write-Host "  - If you have nvm-windows: nvm install 20 && nvm use 20"
    Write-Host "  - Or download from: https://nodejs.org/"
    exit 1
}

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm is not installed." -ForegroundColor Red
    Write-Host "npm should come with Node.js. Please reinstall Node.js."
    exit 1
}

Write-Host "✅ Prerequisites check passed (Node.js $(node -v), npm $(npm -v))" -ForegroundColor Green
Write-Host ""

# Install dependencies
Write-Host "📦 Installing dependencies in project virtual environment..." -ForegroundColor Yellow
Write-Host "This ensures a clean, isolated installation (Node.js equivalent of Python venv)..."

if (Test-Path "node_modules") {
    Write-Host "Removing existing node_modules for fresh install..."
    Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
}

# Check for .nvmrc and use nvm-windows if available
if (Test-Path ".nvmrc") {
    $requiredVersion = (Get-Content .nvmrc).Trim()
    if (Get-Command nvm -ErrorAction SilentlyContinue) {
        Write-Host "Activating Node.js $requiredVersion from .nvmrc (project virtual environment)..."
        nvm use $requiredVersion 2>&1 | Out-Null
    }
}

Write-Host "Installing packages (this may take a minute)..."
npm install 2>&1 | Out-Null

# Verify installation
if (-not (Test-Path "node_modules\.bin\wrangler.cmd") -and -not (Test-Path "node_modules\wrangler")) {
    Write-Host "❌ Installation failed. Please check your internet connection and try again." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed in project virtual environment (node_modules\)" -ForegroundColor Green
Write-Host ""

# Helper function to run wrangler
$wranglerCmd = ".\node_modules\.bin\wrangler.cmd"
if (-not (Test-Path $wranglerCmd)) {
    $wranglerCmd = "npx --yes wrangler"
}

# Add local node_modules/.bin to PATH
$env:PATH = ".\node_modules\.bin;$env:PATH"

# Check Cloudflare authentication
Write-Host "🔐 Checking Cloudflare authentication..." -ForegroundColor Yellow
$whoamiCheck = & $wranglerCmd whoami 2>&1
$whoamiOutput = $whoamiCheck | Out-String

# Check if authenticated
$isAuthenticated = $true
if ($whoamiOutput -match "not authenticated|please run.*login|you are not authenticated") {
    $isAuthenticated = $false
}

if (-not $isAuthenticated) {
    Write-Host "⚠️  Not logged in to Cloudflare." -ForegroundColor Yellow
    Write-Host "Note: Free Cloudflare accounts work fine for this project!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opening browser for authentication..."
    Write-Host "This may take a moment - please complete the login in your browser."
    Write-Host ""
    Write-Host "If the browser doesn't open automatically, you can:"
    Write-Host "  1. Check the terminal for a login URL"
    Write-Host "  2. Or manually run: $wranglerCmd login"
    Write-Host ""
    
    $loginOutput = & $wranglerCmd login 2>&1
    $loginExit = $LASTEXITCODE
    
    if ($loginExit -eq 0) {
        Write-Host ""
        Write-Host "✅ Login successful!" -ForegroundColor Green
        # Verify login
        $verifyCheck = & $wranglerCmd whoami 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Verified: Authentication confirmed"
        }
    } else {
        Write-Host ""
        Write-Host "❌ Login failed or was cancelled" -ForegroundColor Red
        Write-Host "Login output: $loginOutput"
        Write-Host ""
        Write-Host "You can try running manually:"
        Write-Host "  $wranglerCmd login"
        exit 1
    }
} else {
    Write-Host "✅ Already authenticated" -ForegroundColor Green
    Write-Host "Account info:"
    $whoamiCheck | Select-Object -First 3
}
Write-Host ""

# Get account ID
Write-Host "🔍 Getting Cloudflare account ID..." -ForegroundColor Yellow
$existingAccountId = ""
if (Test-Path "wrangler.toml") {
    $tomlContent = Get-Content "wrangler.toml" -Raw
    if ($tomlContent -match 'account_id\s*=\s*"([a-f0-9]{32})"') {
        $existingAccountId = $matches[1]
    }
}

if ($existingAccountId -match '^[a-f0-9]{32}$') {
    Write-Host "✅ Valid account ID already set in wrangler.toml" -ForegroundColor Green
} else {
    # Try to get from whoami
    $whoamiOutput = & $wranglerCmd whoami 2>&1 | Out-String
    $accountId = ""
    
    if ($whoamiOutput -match '[a-f0-9]{32}') {
        $accountId = $matches[0]
    }
    
    # Try from wrangler config
    if (-not $accountId) {
        $wranglerConfig = "$env:USERPROFILE\.wrangler\config\default.toml"
        if (Test-Path $wranglerConfig) {
            $configContent = Get-Content $wranglerConfig -Raw
            if ($configContent -match 'account_id\s*=\s*"([a-f0-9]{32})"') {
                $accountId = $matches[1]
            }
        }
    }
    
    if ($accountId -match '^[a-f0-9]{32}$') {
        Write-Host "✅ Valid account ID detected: $($accountId.Substring(0,8))...$($accountId.Substring(24))" -ForegroundColor Green
        
        # Add to wrangler.toml
        $tomlContent = Get-Content "wrangler.toml" -Raw
        if ($tomlContent -match '# account_id') {
            $tomlContent = $tomlContent -replace '# account_id = .*', "account_id = `"$accountId`""
        } elseif (-not ($tomlContent -match 'account_id\s*=')) {
            $tomlContent = $tomlContent -replace '(name\s*=\s*"[^"]+")', "`$1`naccount_id = `"$accountId`""
        }
        Set-Content "wrangler.toml" $tomlContent
        Write-Host "✅ Account ID added to wrangler.toml" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Could not auto-detect account ID from whoami." -ForegroundColor Yellow
        Write-Host "This is OK - we'll try to extract it from deployment or Vectorize operations."
        Write-Host "If those fail, wrangler will use your authenticated session automatically."
        Write-Host ""
        Write-Host "Note: account_id in wrangler.toml is optional - wrangler can get it from your authenticated session."
    }
}
Write-Host ""

# Check Vectorize index
Write-Host "🔍 Checking Vectorize index..." -ForegroundColor Yellow
$vectorizeList = & $wranglerCmd vectorize list 2>&1 | Out-String
$indexExists = $vectorizeList -match "cloudflare-docs"

if (-not $indexExists) {
    Write-Host "📊 Creating Vectorize index..." -ForegroundColor Yellow
    Write-Host "Note: Vectorize is in beta and may require account verification" -ForegroundColor Yellow
    
    $vectorizeOutput = & $wranglerCmd vectorize create cloudflare-docs --dimensions=768 --metric=cosine 2>&1 | Out-String
    $vectorizeExit = $LASTEXITCODE
    
    if ($vectorizeExit -eq 0) {
        Write-Host "✅ Vectorize index created" -ForegroundColor Green
        $indexExists = $true
    } elseif ($vectorizeOutput -match "duplicate_name|already exists|index.*exists|3002") {
        Write-Host "✅ Vectorize index already exists - RAG will work!" -ForegroundColor Green
        $indexExists = $true
    } else {
        # Try to extract account ID from error
        if (-not $accountId -and $vectorizeOutput -match '/accounts/([a-f0-9]{32})/') {
            $extractedId = $matches[1]
            if ($extractedId -match '^[a-f0-9]{32}$') {
                $accountId = $extractedId
                Write-Host "Extracted account ID from Vectorize error: $($accountId.Substring(0,8))..." -ForegroundColor Green
                # Add to wrangler.toml
                $tomlContent = Get-Content "wrangler.toml" -Raw
                if ($tomlContent -match '# account_id') {
                    $tomlContent = $tomlContent -replace '# account_id = .*', "account_id = `"$accountId`""
                } else {
                    $tomlContent = $tomlContent -replace '(name\s*=\s*"[^"]+")', "`$1`naccount_id = `"$accountId`""
                }
                Set-Content "wrangler.toml" $tomlContent
                Write-Host "✅ Account ID added to wrangler.toml" -ForegroundColor Green
            }
        }
        
        # Check again if index exists
        $vectorizeList = & $wranglerCmd vectorize list 2>&1 | Out-String
        $indexExists = $vectorizeList -match "cloudflare-docs"
        
        if ($indexExists) {
            Write-Host "✅ Vectorize index exists - RAG will work!" -ForegroundColor Green
        } else {
            Write-Host "❌ Vectorize creation failed and index does not exist." -ForegroundColor Red
            Write-Host "This might require:"
            Write-Host "  1. Enabling Vectorize in your Cloudflare dashboard"
            Write-Host "  2. Account verification (check your email)"
            Write-Host "  3. Or Vectorize may not be available in your region yet"
            Write-Host ""
            Write-Host "⚠️  WARNING: RAG features will NOT work without Vectorize!" -ForegroundColor Red
            Write-Host "You can create the index manually later with:"
            Write-Host "  $wranglerCmd vectorize create cloudflare-docs --dimensions=768 --metric=cosine"
        }
    }
} else {
    Write-Host "✅ Vectorize index already exists" -ForegroundColor Green
}
Write-Host ""

# Deploy Worker
Write-Host "🚀 Deploying Cloudflare Worker..." -ForegroundColor Yellow
Write-Host "Note: Workers AI (Llama 3.3) may require enabling in dashboard" -ForegroundColor Yellow
Write-Host "If deployment fails with AI errors, enable Workers AI at:"
Write-Host "https://dash.cloudflare.com -> Workers & Pages -> AI"
Write-Host ""

$deployOutput = npm run deploy 2>&1 | Out-String
$deployExit = $LASTEXITCODE

if ($deployExit -ne 0) {
    Write-Host $deployOutput
    Write-Host ""
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check the error above and try again."
    Write-Host "Common issues:"
    Write-Host "  - Workers AI not enabled in dashboard"
    Write-Host "  - Invalid account_id in wrangler.toml"
    Write-Host "  - Network connectivity issues"
    exit 1
}

Write-Host $deployOutput
Write-Host "✅ Worker deployed" -ForegroundColor Green
Write-Host ""

# Extract worker URL
$workerUrl = ""
if ($deployOutput -match 'https://[^\s]+\.workers\.dev') {
    $workerUrl = $matches[0]
    Write-Host "Auto-detected Worker URL from deployment: $workerUrl"
}

# Fallback: try to construct from account info
if (-not $workerUrl) {
    $workerName = ""
    if (Test-Path "wrangler.toml") {
        $tomlContent = Get-Content "wrangler.toml" -Raw
        if ($tomlContent -match 'name\s*=\s*"([^"]+)"') {
            $workerName = $matches[1]
        }
    }
    
    if ($workerName) {
        $whoamiInfo = & $wranglerCmd whoami 2>&1 | Out-String
        # Try to extract subdomain from email or account info
        if ($whoamiInfo -match '([a-zA-Z0-9_-]+)@') {
            $email = $matches[1]
            $workerUrl = "https://$workerName.$email.workers.dev"
            Write-Host "Auto-detected Worker URL from subdomain: $workerUrl"
        }
    }
}

# Populate Vectorize
if ($indexExists -and $workerUrl) {
    Write-Host "📚 Populating Vectorize index with documentation..." -ForegroundColor Yellow
    Write-Host "This is required for RAG features to work..."
    Write-Host "This may take a minute..."
    Write-Host ""
    
    Start-Sleep -Seconds 5
    
    try {
        $populateResponse = Invoke-WebRequest -Uri "$workerUrl/populate" -Method POST -UseBasicParsing -ErrorAction Stop
        if ($populateResponse.Content -match "success|populated") {
            Write-Host "✅ Vectorize index populated - RAG is now functional!" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Vectorize population may have failed." -ForegroundColor Yellow
            Write-Host "Response: $($populateResponse.Content)"
            Write-Host ""
            Write-Host "⚠️  WARNING: RAG features will not work without populated Vectorize index!" -ForegroundColor Red
            Write-Host "You can manually populate later with:"
            Write-Host "  curl -X POST $workerUrl/populate"
        }
    } catch {
        Write-Host "⚠️  Vectorize population failed: $_" -ForegroundColor Yellow
        Write-Host "⚠️  WARNING: RAG features will not work without populated Vectorize index!" -ForegroundColor Red
    }
    Write-Host ""
} elseif (-not $indexExists) {
    Write-Host "⚠️  WARNING: Vectorize index does not exist. RAG features will not work!" -ForegroundColor Red
    Write-Host "The script will continue, but documentation search will be unavailable."
    Write-Host ""
} elseif (-not $workerUrl) {
    Write-Host "⚠️  Could not populate Vectorize - Worker URL not detected." -ForegroundColor Yellow
    Write-Host "RAG features may not work. You can populate manually after finding your Worker URL."
    Write-Host ""
}

# Start frontend
Write-Host "🎨 Starting frontend development server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
if ($workerUrl) {
    Write-Host "Frontend will be available at: http://localhost:8788" -ForegroundColor Cyan
    Write-Host "(Note: If port 8788 is in use, Wrangler will use the next available port - check the output above)" -ForegroundColor Yellow
    Write-Host "Worker is deployed at: $workerUrl" -ForegroundColor Cyan
} else {
    Write-Host "Frontend will be available at: http://localhost:8788" -ForegroundColor Cyan
    Write-Host "(Note: If port 8788 is in use, Wrangler will use the next available port - check the output above)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Press Ctrl+C to stop the dev server" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Start the dev server
npm run pages:dev

