# Cloudflare Developer Assistant

An AI-powered developer assistant built on Cloudflare's platform that helps developers build applications using Cloudflare Workers, D1, R2, Vectorize, and other Cloudflare services. The assistant provides intelligent code generation, documentation search, and real-time chat support.

**Built for the Cloudflare AI Assignment** - Demonstrating the full power of Cloudflare's AI and edge computing platform.

## Features

- **Intelligent Code Generation**: Generate complete, production-ready Cloudflare Workers code from natural language descriptions
- **Documentation Search**: RAG-powered search over Cloudflare documentation using Vectorize
- **Real-time Chat**: WebSocket-based chat interface for interactive assistance
- **Project Memory**: Maintains conversation context and project state across sessions
- **Multi-step Workflows**: Uses Cloudflare Workflows for complex code generation tasks
- **Beautiful UI**: Modern, responsive frontend with smooth animations

## Architecture

This application demonstrates the full power of Cloudflare's platform:

- **Agents SDK**: Stateful AI agents with built-in database and WebSocket support
- **Workers AI**: Llama 3.3 for code generation and BGE embeddings for semantic search
- **Vectorize**: Vector database for RAG over Cloudflare documentation
- **Durable Objects**: Persistent state and WebSocket coordination
- **Pages**: Frontend hosting with edge deployment
- **Workflows**: Multi-step orchestration for complex tasks

## Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers AI enabled
- Wrangler CLI installed globally: `npm install -g wrangler`
- Cloudflare API token with appropriate permissions

## Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd cf_ai_developer_assistant
npm install
```

### 2. Create Vectorize Index

Create a Vectorize index for storing documentation embeddings:

```bash
wrangler vectorize create cloudflare-docs \
  --dimensions=768 \
  --metric=cosine
```

### 3. Populate Vectorize Index

Populate the index with Cloudflare documentation (run this after deploying):

```bash
# Deploy the populate script first, then:
curl -X POST https://your-worker.your-subdomain.workers.dev/populate \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

Or use the included script after deployment:

```bash
npm run populate
```

### 4. Configure Wrangler

Update `wrangler.toml` with your account ID:

```bash
wrangler login
wrangler whoami
```

Then add your account ID to `wrangler.toml`:

```toml
account_id = "your-account-id"
```

### 5. Deploy

Deploy the Workers application:

```bash
npm run deploy
```

Deploy the Pages frontend:

```bash
npm run pages:deploy
```

Or deploy both together (Workers handles the backend, Pages serves the frontend).

## Local Development

### Run Workers Locally

```bash
npm run dev
```

### Run Pages Locally

```bash
npm run pages:dev
```

The frontend will be available at `http://localhost:8788` and will connect to your local Worker.

## Usage

### Chat Interface

1. Open the deployed Pages URL or local development server
2. Ask questions about Cloudflare Workers, D1, R2, or any Cloudflare service
3. The assistant will search documentation and provide accurate answers

### Code Generation

1. Click the code generation button (</>) or describe what you want to build
2. Provide a natural language description like:
   - "Create a Workers API that stores user data in D1"
   - "Generate a RAG application with Vectorize and Workers AI"
   - "Build a real-time chat app using Durable Objects"
3. The assistant will generate complete, production-ready code with:
   - TypeScript Workers code
   - wrangler.toml configuration
   - Proper bindings and error handling
   - Best practices and optimizations

### Quick Actions

Use the quick action buttons for common tasks:
- D1 Database Setup
- R2 Image API
- Durable Objects Chat
- RAG with Vectorize

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main Worker entry point
│   ├── agent.ts              # DeveloperAssistantAgent class
│   ├── db-init.ts            # Database initialization
│   └── populate.ts           # Vectorize population script
├── frontend/
│   ├── index.html            # Frontend HTML
│   ├── app.js                # Frontend JavaScript
│   ├── styles.css            # Styling
│   └── _functions/           # Pages Functions
├── scripts/
│   └── populate-vectorize.ts # Documentation data
├── wrangler.toml             # Wrangler configuration
├── package.json
└── README.md
```

## API Endpoints

### Worker Endpoints

- `GET /health` - Health check
- `POST /agent/chat` - Send chat message (HTTP fallback)
- `POST /agent/generate` - Generate code (HTTP fallback)
- `POST /agent/search` - Search documentation
- `WebSocket /agent` - Real-time chat and code generation

### Pages Endpoints

- `GET /` - Frontend application
- All `/agent/*` routes are proxied to the Worker

## Configuration

### Environment Variables

Set in `wrangler.toml` or via `wrangler secret put`:

- No additional secrets required (uses Cloudflare bindings)

### Bindings

The application uses these Cloudflare bindings:
- `AI` - Workers AI for LLM and embeddings
- `VECTORIZE_INDEX` - Vectorize index for documentation search
- `DEVELOPER_AGENT` - Durable Object for the agent

## Database Schema

The agent uses SQLite (via Agents SDK) with these tables:

- `conversation_messages` - Chat history
- `project_state` - Project state and generated code history

## Customization

### Adding More Documentation

Edit `scripts/populate-vectorize.ts` to add more Cloudflare documentation chunks. The script uses the BGE embedding model to create vectors.

### Modifying Prompts

Edit the system prompts in `src/agent.ts`:
- `processChatMessage()` - Chat system prompt
- `processCodeGeneration()` - Code generation system prompt

### Styling

Modify `frontend/styles.css` to customize the UI. The design uses CSS variables for easy theming.

## Troubleshooting

### Vectorize Index Not Found

Ensure you've created the index and it matches the name in `wrangler.toml`:
```bash
wrangler vectorize list
```

### WebSocket Connection Fails

The application falls back to HTTP automatically. Check that Durable Objects are properly configured:
```bash
wrangler durable-objects list
```

### Code Generation Issues

Ensure Workers AI is enabled in your account and you have access to the Llama 3.3 model.

## Performance

- **Response Time**: Typically 2-5 seconds for code generation
- **Concurrent Users**: Scales automatically with Cloudflare's edge network
- **Cost**: Pay-per-use for Workers AI, Vectorize queries, and Durable Object invocations

## Security

- All communication uses HTTPS/WSS
- No API keys stored in client code
- State isolated per Durable Object instance
- Input validation on all endpoints

## Contributing

This is a demonstration project for Cloudflare's platform capabilities. Feel free to fork and extend it!

## License

MIT

## Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Agents SDK](https://developers.cloudflare.com/agents/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Vectorize](https://developers.cloudflare.com/vectorize/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)

---

**Note**: This project requires a Cloudflare account with Workers AI enabled. Some features may require a paid plan depending on usage.
