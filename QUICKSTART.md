# Quick Start Guide

Get the Cloudflare Developer Assistant running in 5 minutes.

## Prerequisites Check

```bash
node --version  # Should be 18+
npm --version
wrangler --version  # Install with: npm install -g wrangler
```

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate with Cloudflare.

## Step 3: Create Vectorize Index

```bash
wrangler vectorize create cloudflare-docs \
  --dimensions=768 \
  --metric=cosine
```

## Step 4: Deploy the Worker

```bash
npm run deploy
```

Note: You may need to add your `account_id` to `wrangler.toml` first. Get it with:
```bash
wrangler whoami
```

## Step 5: Populate Vectorize (Optional but Recommended)

After deployment, populate the Vectorize index with documentation:

```bash
# Get your worker URL from the deploy output, then:
curl -X POST https://your-worker.your-subdomain.workers.dev/populate
```

Or use the included script:
```bash
npm run populate
```

## Step 6: Deploy Frontend

```bash
npm run pages:deploy
```

Or run locally:
```bash
npm run pages:dev
```

## Step 7: Test It Out!

1. Open your Pages URL (from deploy output)
2. Try asking: "How do I create a Worker with D1?"
3. Or click a quick action button
4. Generate code by describing a project

## Troubleshooting

### "Vectorize index not found"
- Make sure you created the index with the exact name `cloudflare-docs`
- Check: `wrangler vectorize list`

### "Durable Objects error"
- Ensure migrations ran: check `wrangler.toml` has the migration
- Redeploy: `npm run deploy`

### "Workers AI not available"
- Enable Workers AI in your Cloudflare dashboard
- Check you have access to the Llama 3.3 model

### WebSocket connection fails
- The app automatically falls back to HTTP
- Check that Durable Objects are properly configured

## Next Steps

- Customize prompts in `src/agent.ts`
- Add more documentation to `scripts/populate-vectorize.ts`
- Modify UI in `frontend/styles.css`
- Add more features!

## Need Help?

Check the main [README.md](README.md) for detailed documentation.

