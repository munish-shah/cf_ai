# DevAssist - Cloudflare AI Developer Assistant

A production-ready AI-powered developer assistant built entirely on Cloudflare's edge computing platform. DevAssist combines state-of-the-art LLM capabilities with semantic search to help developers build, understand, and deploy Cloudflare Workers applications through natural language interaction.

**Built for Cloudflare AI Use Cases** - A comprehensive demonstration of Cloudflare's AI infrastructure, showcasing Workers AI, Agents SDK, Vectorize, Durable Objects, and Pages working together in a cohesive, production-grade application.

## Features

### Core Capabilities

- **Intelligent Code Generation**: Transform natural language descriptions into complete, production-ready Cloudflare Workers code. The system generates multi-file project structures with proper TypeScript types, error handling, and Cloudflare best practices. Code blocks are intelligently parsed with filename extraction and context-aware ordering.

- **Advanced RAG Pipeline**: Implements a sophisticated Retrieval Augmented Generation system using Vectorize for semantic search over Cloudflare's documentation. The pipeline uses BGE (BAAI General Embedding) model to generate 768-dimensional embeddings, enabling contextually relevant documentation retrieval that enhances LLM responses with accurate, up-to-date information.

- **Stateful AI Agent Architecture**: Built on Cloudflare's Agents SDK, the assistant maintains persistent state across sessions using SQLite. Each conversation preserves context, project state, and generated code history, enabling multi-turn interactions that build upon previous exchanges.

- **Real-time Communication**: WebSocket-based bidirectional communication with automatic HTTP fallback. Features include streaming responses, dynamic progress indicators, and typing animations that provide immediate user feedback during AI processing.

- **Production-Grade Frontend**: Modern, responsive UI built with React and Tailwind CSS. Features VS Code-style syntax highlighting, smooth animations, and an intuitive chat interface that scales seamlessly across devices.

### Technical Highlights

- **Model Management**: Intelligent fallback system using Llama 3.3 70B (fp8-fast) as primary model with automatic fallback to Llama 3.1 8B for broader availability. Dynamic token allocation based on query complexity (1024-1536 for chat, 3072 for code generation).

- **Performance Optimizations**: Parallel execution of Vectorize queries and database operations, truncated context windows, and optimized embedding queries. Response times typically 1-3 seconds for chat, 2-5 seconds for code generation.

- **Edge-Native Architecture**: Fully serverless deployment across Cloudflare's global network, ensuring low-latency responses from 300+ data centers worldwide.

## Architecture

DevAssist is architected as a distributed system leveraging Cloudflare's edge computing infrastructure. The application demonstrates enterprise-grade patterns including stateful agents, semantic search, and real-time communication.

### System Components

**Cloudflare Worker (Entry Point)**
- Routes requests to the Durable Object agent
- Handles CORS and authentication
- Manages Vectorize population endpoint
- Provides health check and monitoring endpoints

**Durable Object (DeveloperAssistantAgent)**
- Extends Cloudflare's Agents SDK for stateful AI agent capabilities
- Manages WebSocket connections for real-time bidirectional communication
- Implements SQLite database for persistent conversation history and project state
- Handles chat message processing, code generation, and documentation search
- Maintains isolated state per agent instance with automatic scaling

**Workers AI Integration**
- **LLM Models**: Primary Llama 3.3 70B (fp8-fast) with intelligent fallback to Llama 3.1 8B
- **Embedding Model**: BGE (BAAI General Embedding) v1.5 for 768-dimensional vector generation
- Serverless GPU inference at the edge with automatic model selection and error handling

**Vectorize (Vector Database)**
- Stores 768-dimensional embeddings of Cloudflare documentation
- Cosine similarity search for semantic retrieval
- Optimized queries with topK=3 for performance
- Metadata storage for title, content, and URL references

**Cloudflare Pages (Frontend)**
- Edge-hosted static site with Pages Functions for API proxying
- React-based UI with real-time WebSocket communication
- Automatic global CDN distribution

**SQLite Database (via Agents SDK)**
- `conversation_messages`: Persistent chat history with conversation grouping
- `project_state`: Project context and generated code history
- Indexed queries for fast conversation retrieval
- Automatic schema initialization and migrations

### Data Flow

1. **User Request** → Frontend sends message via WebSocket or HTTP
2. **Worker Routing** → Main worker routes to Durable Object instance
3. **Parallel Processing** → Agent simultaneously:
   - Generates query embedding using BGE model
   - Queries Vectorize for relevant documentation
   - Retrieves conversation history from SQLite
4. **RAG Context Assembly** → Documentation chunks are formatted and truncated for optimal token usage
5. **LLM Inference** → System prompt + context + history sent to Llama model
6. **Response Processing** → Generated code is parsed, ordered, and formatted
7. **State Persistence** → Conversation and project state saved to SQLite
8. **Real-time Delivery** → Response streamed back via WebSocket with progress updates

## Prerequisites

- Node.js 20+ and npm (or nvm for automatic version management)
- Cloudflare account (free accounts work fine)
- Workers AI enabled in your Cloudflare dashboard
- Vectorize enabled (may require account verification)

**Note**: This project uses a virtual environment approach (similar to Python's venv):
- Node.js version is pinned in `.nvmrc` (automatically managed)
- Dependencies are installed locally in `node_modules/` (isolated from global packages)
- The setup script automatically handles Node.js version switching using nvm

## Quick Start

The easiest way to get started is using the automated setup script:

### macOS/Linux/Windows (Bash)

```bash
./start.sh
```

**For Windows users**: If you don't have bash, install one of these or perform manual setup below:
- **Git Bash** (recommended): Download from https://git-scm.com/downloads
- **WSL** (Windows Subsystem for Linux): Follow [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install)

Then run `./start.sh` in Git Bash or WSL.

This script will:
1. Check prerequisites (Node.js, npm)
2. Install dependencies locally
3. Authenticate with Cloudflare (opens browser)
4. Auto-detect your account ID (uses environment variable for security)
5. Create Vectorize index if needed
6. Deploy the Worker
7. Populate Vectorize with documentation
8. Start the local frontend development server

The frontend will be available at `http://localhost:8788` (or the next available port if 8788 is in use) and will connect to your deployed Worker. The actual port will be shown in the terminal output.

**Important Notes:**
- Account ID is set via `CLOUDFLARE_ACCOUNT_ID` environment variable (never committed to git)
- If deployment fails with "workers.dev subdomain" error, visit https://dash.cloudflare.com → Workers & Pages → open Workers menu to create your subdomain

## Manual Setup

If you prefer to set up manually:

### 1. Clone and Install

```bash
git clone https://github.com/munish-shah/cf_ai_.git
cd cf_ai
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This will open your browser for authentication. Free Cloudflare accounts work fine for this project.

### 3. Configure Account ID

**Important**: Never commit your account ID to git! The setup script will auto-detect it, or you can set it in a `.env` file.

**Option 1: Use .env file (Recommended for manual setup)**
Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your account ID
# CLOUDFLARE_ACCOUNT_ID=your-account-id-here
```
### Windows Non-Bash

```bash
# Copy the example file
copy .env.example .env

# Edit .env and add your account ID
# CLOUDFLARE_ACCOUNT_ID=your-account-id-here
```

Get your account ID:
```bash
npx wrangler whoami
```

The `.env` file is already in `.gitignore`, so it will never be committed to git.

**Option 2: Environment variable (Session only)**
If you prefer to set it as an environment variable for just this session:

```bash
# Linux/macOS/Git Bash
export CLOUDFLARE_ACCOUNT_ID='your-account-id-here'

# Windows PowerShell
$env:CLOUDFLARE_ACCOUNT_ID='your-account-id-here'
```

**Note**: 
- The `.env` file persists across sessions (recommended)
- Environment variables are only active for your current terminal session
- Wrangler can also auto-detect your account ID from your authenticated session, so this step is optional
- The account ID is **never** written to `wrangler.toml` to prevent accidentally committing it to git

### 4. Create Vectorize Index

Create a Vectorize index for storing documentation embeddings:

```bash
npx wrangler vectorize create cloudflare-docs --dimensions=768 --metric=cosine
```

Note: Vectorize is in beta and may require enabling in your Cloudflare dashboard or account verification.

### 5. Deploy Worker

Deploy the backend Worker:

```bash
npm run deploy
```

**Important**: If you get an error about "workers.dev subdomain" (error code 10063), you need to create one first:

The setup script will automatically detect your account ID and provide a direct link. Or manually:
1. Get your account ID: `npx wrangler whoami` (look for the 32-character hex string)
2. Visit: `https://dash.cloudflare.com/YOUR_ACCOUNT_ID/workers-and-pages`
   - Replace `YOUR_ACCOUNT_ID` with your actual account ID
3. Open the **Workers** menu for the first time (this creates your subdomain automatically)
4. Then run `npm run deploy` again

The deployment output will show your Worker URL (e.g., `https://cf-ai-developer-assistant.your-subdomain.workers.dev`).

### 6. Populate Vectorize Index

After deployment, populate the index with Cloudflare documentation:

**Linux/macOS/Git Bash:**
```bash
curl -X POST "https://your-worker.your-subdomain.workers.dev/populate"
```

**Windows PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://your-worker.your-subdomain.workers.dev/populate" -Method POST
```

**Windows CMD:**
```cmd
curl -X POST "https://your-worker.your-subdomain.workers.dev/populate"
```

Replace `your-worker.your-subdomain` with your actual Worker URL from step 5.

### 7. Start Frontend

Start the local development server:

```bash
npm run pages:dev
```

The frontend will be available at `http://localhost:8788` (or the next available port if 8788 is in use). The actual port will be shown in the terminal output.

## Usage

### Chat Interface

The chat interface provides intelligent documentation search and Q&A capabilities:

1. Open the deployed Pages URL or local development server (default: `http://localhost:8788`, check terminal for actual port)
2. Ask questions about any Cloudflare service:
   - "How do I use Durable Objects for WebSocket coordination?"
   - "What's the best way to implement RAG with Vectorize?"
   - "How do I configure D1 database bindings in wrangler.toml?"
3. The assistant performs semantic search over Cloudflare documentation using Vectorize, retrieves relevant context, and generates accurate, context-aware responses
4. Conversation history is automatically maintained across messages, enabling follow-up questions and multi-turn discussions

**Technical Details**: Each query triggers a RAG pipeline that generates embeddings, searches Vectorize for top-3 relevant documentation chunks, formats context, and sends to the LLM with conversation history. Responses are streamed in real-time via WebSocket.

### Code Generation

Transform natural language into production-ready Cloudflare Workers code:

1. Click the code generation button or describe what you want to build
2. Provide detailed descriptions like:
   - "Create a Workers API that stores user data in D1 with proper error handling"
   - "Generate a RAG application with Vectorize and Workers AI for semantic search"
   - "Build a real-time chat app using Durable Objects with WebSocket support"
3. The assistant generates complete, production-ready code including:
   - Multiple TypeScript files with proper structure and filenames
   - Complete `wrangler.toml` configuration with bindings
   - Type-safe implementations with proper error handling
   - Cloudflare best practices and edge computing optimizations
   - Code blocks displayed with VS Code-style syntax highlighting

4. Review generated code directly in the chat interface - code blocks are intelligently ordered with filenames, preserving the natural flow of explanations and code

**Technical Details**: Code generation uses an enhanced system prompt with documentation context and project state. The LLM generates markdown with code blocks, which are parsed to extract filenames, preserve order, and format for display. Generated code is stored in project state for future context.

## Project Structure

```
.
├── src/
│   ├── index.ts              # Main Worker entry point, routing, CORS
│   ├── agent.ts              # DeveloperAssistantAgent Durable Object
│   ├── db-init.ts            # SQLite database schema initialization
│   └── populate.ts           # Vectorize population endpoint
├── frontend/
│   ├── index.html            # Frontend HTML with React components
│   └── _functions/           # Pages Functions for proxying
│       └── [[path]].ts       # Proxy function for Worker requests
├── scripts/
│   └── populate-vectorize.ts # Documentation data for Vectorize
├── start.sh                  # Automated setup and deployment script
├── wrangler.toml             # Wrangler configuration
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

### Worker Endpoints

- `GET /health` - Health check
- `POST /populate` - Populate Vectorize index with documentation
- `POST /agent/chat` - Send chat message (HTTP fallback)
- `POST /agent/generate` - Generate code (HTTP fallback)
- `POST /agent/search` - Search documentation
- `WebSocket /agent` - Real-time chat and code generation

### Pages Endpoints

- `GET /` - Frontend application
- All `/agent/*` routes are proxied to the Worker via Pages Functions

## Configuration

### Wrangler Configuration

The `wrangler.toml` file configures:

- Worker name and entry point
- AI binding for Workers AI
- Vectorize index binding
- Durable Object binding and migrations
- Environment variables

### Bindings

The application uses these Cloudflare bindings:

- `AI` - Workers AI for LLM (Llama 3.3/3.1) and embeddings (BGE)
- `VECTORIZE_INDEX` - Vectorize index for documentation search
- `DEVELOPER_AGENT` - Durable Object for the agent instance

## Database Schema

The agent uses SQLite (via Agents SDK) for persistent state management:

**conversation_messages**
- `id` (INTEGER PRIMARY KEY) - Auto-incrementing message ID
- `conversation_id` (TEXT) - Groups messages into conversations
- `role` (TEXT) - Message role: 'user' or 'assistant'
- `content` (TEXT) - Full message content
- `created_at` (INTEGER) - Unix timestamp
- Index on `conversation_id` for O(log n) conversation retrieval

**project_state**
- `id` (INTEGER PRIMARY KEY) - Single row for current project state
- `state` (TEXT) - JSON-encoded project state including:
  - Generated files with paths and content
  - Last generation timestamp
  - Project metadata
- `updated_at` (INTEGER) - Unix timestamp of last update

The schema is automatically initialized on first Durable Object instantiation via `initializeDatabase()`.

## Performance Optimizations

The application implements several sophisticated optimizations to minimize latency and maximize throughput:

**Query Processing**
- Parallel execution of Vectorize semantic search and SQLite conversation history retrieval using `Promise.all()`
- Dynamic token allocation: 1024 tokens for simple queries, 1536 for complex queries, 3072 for code generation
- Context window truncation: Documentation context limited to 1000 chars, project state to 800 chars
- Conversation history limited to last 6 messages (3 exchanges) to reduce prompt size

**Vectorize Optimization**
- Reduced topK from 5 to 3 for faster queries
- Content truncation to ~500 characters per result
- Efficient embedding generation using BGE model's optimized inference

**Database Operations**
- Parallel saves for user and assistant messages
- Indexed queries on `conversation_id` for O(log n) lookups
- Batch operations where possible

**Model Selection**
- Primary model (Llama 3.3 fp8-fast) for best quality
- Automatic fallback to Llama 3.1 8B for availability
- Final fallback to prompt-based format if message API fails
- Model selection logged and included in responses for transparency

**Response Streaming**
- WebSocket-based streaming for immediate user feedback
- Progress messages during processing ("Searching documentation...", "Generating code...")
- Typing animations in frontend for perceived performance

## Troubleshooting

### Vectorize Index Not Found

Ensure you've created the index and it matches the name in `wrangler.toml`:

```bash
npx wrangler vectorize list
```

If the index doesn't exist, create it:

```bash
npx wrangler vectorize create cloudflare-docs --dimensions=768 --metric=cosine
```

### Workers AI Not Available

Ensure Workers AI is enabled in your Cloudflare dashboard:
1. Go to https://dash.cloudflare.com
2. Navigate to Workers & Pages > AI
3. Enable Workers AI if not already enabled

Some models may require account verification or may not be available in all regions.

### WebSocket Connection Fails

The application automatically falls back to HTTP if WebSocket fails. Check that Durable Objects are properly configured:

```bash
npx wrangler durable-objects list
```

### Deployment Fails

Common issues:

1. **Account ID not set**: Add your account ID to `wrangler.toml`
2. **Workers AI not enabled**: Enable it in the dashboard
3. **Vectorize not available**: May require account verification (check email)
4. **Model not found**: The app will automatically fallback to Llama 3.1 if 3.3 is unavailable

### Frontend Can't Connect to Worker

If running locally, the frontend connects directly to your deployed Worker URL. Ensure:
1. The Worker is deployed successfully
2. CORS headers are properly configured (they are by default)
3. The Worker URL in the frontend matches your deployed URL

## Local Development

### Run Workers Locally

```bash
npm run dev
```

This starts the Worker locally. Note that Durable Objects and Workers AI require deployment to work fully.

### Run Pages Locally

```bash
npm run pages:dev
```

The frontend will be available at `http://localhost:8788` (or the next available port if 8788 is in use) and will connect to your deployed Worker. The actual port will be shown in the terminal output.

## Customization

### Adding More Documentation

Edit `scripts/populate-vectorize.ts` to add more Cloudflare documentation chunks. The script uses the BGE embedding model to create vectors.

### Modifying System Prompts

Edit the system prompts in `src/agent.ts`:
- `processChatMessage()` - Chat system prompt
- `processCodeGeneration()` - Code generation system prompt

### Styling

Modify `frontend/index.html` to customize the UI. The design uses Tailwind CSS for styling.

## Security

- All communication uses HTTPS/WSS
- No API keys stored in client code (uses Cloudflare bindings)
- State isolated per Durable Object instance
- Input validation on all endpoints
- CORS headers configured for cross-origin requests

## Performance

- **Response Time**: Typically 2-5 seconds for code generation, 1-3 seconds for chat
- **Concurrent Users**: Scales automatically with Cloudflare's edge network
- **Cost**: Pay-per-use for Workers AI, Vectorize queries, and Durable Object invocations
- **Free Tier**: Cloudflare's free tier includes generous limits for Workers AI and Vectorize

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


**Note**: This project requires a Cloudflare account with Workers AI enabled. Some features may require account verification depending on your region and account status.
