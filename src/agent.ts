import { Agent } from "agents";
import { initializeDatabase } from "./db-init";

export interface Env {
  AI: Ai;
  VECTORIZE_INDEX: VectorizeIndex;
}

export class DeveloperAssistantAgent extends Agent {
  private env: Env;
  private dbInitialized: boolean = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.env = env;
  }

  private async ensureDatabaseInitialized() {
    if (!this.dbInitialized) {
      await initializeDatabase(this);
      this.dbInitialized = true;
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureDatabaseInitialized();
    
    const url = new URL(request.url);

    // Handle OPTIONS for CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      return this.handleChat(request);
    }

    if (url.pathname === "/generate" && request.method === "POST") {
      return this.handleCodeGeneration(request);
    }

    if (url.pathname === "/search" && request.method === "POST") {
      return this.handleDocumentationSearch(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === "chat") {
        await this.processChatMessage(ws, data.message, data.conversationId);
      } else if (data.type === "generate") {
        await this.processCodeGeneration(ws, data.prompt, data.projectType);
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }

  private async processChatMessage(
    ws: WebSocket,
    message: string,
    conversationId?: string
  ): Promise<void> {
    // Generate or reuse conversation ID for context continuity
    const convId = conversationId || `conv_${Date.now()}`;
    
    ws.send(JSON.stringify({
      type: "thinking",
      message: "Searching documentation and generating response...",
    }));

    // Fetch relevant docs and previous conversation context
    const context = await this.searchDocumentation(message);
    const conversationHistory = await this.getConversationHistory(convId);

    // System prompt guides the model's behavior and knowledge boundaries
    const systemPrompt = `You are an expert Cloudflare developer assistant. You help developers build applications on Cloudflare's platform.

Your knowledge includes:
- Cloudflare Workers, Pages, Durable Objects
- D1 (SQLite), R2 (object storage), KV (key-value), Vectorize (vector database)
- Workers AI, AI Gateway
- Best practices for edge computing and serverless architecture
- wrangler.toml configuration

Always provide accurate, up-to-date information. When generating code, make sure it's production-ready and follows Cloudflare best practices.
Use TypeScript for type safety. Include proper error handling and edge cases.

Context from documentation:
${context}

Previous conversation:
${conversationHistory.length > 0 ? conversationHistory.map(c => `${c.role}: ${c.content}`).join('\n') : 'None'}`;

    const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: message },
      ],
      max_tokens: 2048,
    });

    const assistantMessage = response.response || "I couldn't generate a response.";
    
    await this.saveConversationMessage(convId, "user", message);
    await this.saveConversationMessage(convId, "assistant", assistantMessage);

    ws.send(JSON.stringify({
      type: "response",
      message: assistantMessage,
      conversationId: convId,
    }));
  }

  private async processCodeGeneration(
    ws: WebSocket,
    prompt: string,
    projectType?: string
  ): Promise<void> {
    ws.send(JSON.stringify({
      type: "progress",
      step: "analyzing",
      message: "Analyzing requirements...",
    }));

    const context = await this.searchDocumentation(prompt);
    const projectState = await this.getProjectState();

    ws.send(JSON.stringify({
      type: "progress",
      step: "generating",
      message: "Generating code and configuration...",
    }));

    const systemPrompt = `You are a Cloudflare code generation expert. Generate complete, production-ready code for Cloudflare Workers.

Requirements:
1. Generate TypeScript code (not JavaScript)
2. Include proper type definitions
3. Add error handling
4. Follow Cloudflare best practices
5. Include wrangler.toml configuration if needed
6. Add comments only where necessary for complex logic
7. Make code clean and maintainable

Documentation context:
${context}

Current project state:
${JSON.stringify(projectState, null, 2)}`;

    const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nProject type: ${projectType}` : ''}` },
      ],
      max_tokens: 4096,
    });

    const generatedCode = response.response || "";
    
    const codeBlocks = this.extractCodeBlocks(generatedCode);
    const config = this.extractConfig(generatedCode);

    ws.send(JSON.stringify({
      type: "complete",
      code: codeBlocks,
      config: config,
      explanation: this.extractExplanation(generatedCode),
    }));

    await this.saveProjectState({
      lastGenerated: Date.now(),
      prompt,
      files: codeBlocks.map((block, i) => ({
        path: block.filename || `file${i + 1}.ts`,
        content: block.code,
      })),
    });
  }

  // RAG: embed query and find similar documentation chunks
  private async searchDocumentation(query: string): Promise<string> {
    try {
      // Generate embedding for the user's query
      const queryVector = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [query],
      });

      if (!queryVector || !Array.isArray(queryVector.data) || queryVector.data.length === 0) {
        return "No documentation context available.";
      }

      // Semantic search in Vectorize
      const results = await this.env.VECTORIZE_INDEX.query(
        queryVector.data[0],
        { topK: 5, returnMetadata: true }
      );

      if (!results || results.length === 0) {
        return "No relevant documentation found.";
      }

      // Format results for LLM context
      return results
        .map((result) => {
          const metadata = result.metadata as Record<string, string>;
          return `Title: ${metadata.title || 'Unknown'}\nContent: ${metadata.content || result.id}\nURL: ${metadata.url || ''}`;
        })
        .join("\n\n---\n\n");
    } catch (error) {
      console.error("Documentation search error:", error);
      return "Error searching documentation.";
    }
  }

  // Parse markdown code blocks from LLM response
  // Handles both named files and anonymous code blocks
  private extractCodeBlocks(text: string): Array<{ filename: string; code: string; language: string }> {
    const codeBlockRegex = /```(\w+)?\s*(?:filename="([^"]+)")?\n([\s\S]*?)```/g;
    const blocks: Array<{ filename: string; code: string; language: string }> = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      blocks.push({
        language: match[1] || "typescript",
        filename: match[2] || "",
        code: match[3].trim(),
      });
    }

    // Fallback for malformed code blocks
    if (blocks.length === 0 && text.includes("```")) {
      const fallbackMatch = text.match(/```[\s\S]*?```/);
      if (fallbackMatch) {
        blocks.push({
          language: "typescript",
          filename: "",
          code: fallbackMatch[0].replace(/```\w*\n?/g, "").replace(/```/g, "").trim(),
        });
      }
    }

    return blocks;
  }

  private extractConfig(text: string): string | null {
    const configMatch = text.match(/wrangler\.toml[\s\S]*?```[\s\S]*?```/i);
    if (configMatch) {
      return configMatch[0].replace(/wrangler\.toml[\s\S]*?```/i, "").replace(/```/g, "").trim();
    }
    return null;
  }

  private extractExplanation(text: string): string {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const withoutCode = text.replace(codeBlockRegex, "").trim();
    return withoutCode || "Code generated successfully.";
  }

  private async getConversationHistory(conversationId: string): Promise<Array<{ role: string; content: string }>> {
    try {
      const result = await this.sql`
        SELECT role, content FROM conversation_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
        LIMIT 20
      `;
      return result as Array<{ role: string; content: string }>;
    } catch (error) {
      return [];
    }
  }

  private async saveConversationMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<void> {
    try {
      await this.sql`
        INSERT INTO conversation_messages (conversation_id, role, content, created_at)
        VALUES (${conversationId}, ${role}, ${content}, ${Date.now()})
      `;
    } catch (error) {
      console.error("Error saving conversation message:", error);
    }
  }

  private async getProjectState(): Promise<Record<string, any>> {
    try {
      const result = await this.sql`
        SELECT state FROM project_state
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      if (result && Array.isArray(result) && result.length > 0) {
        const row = result[0] as any;
        return typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
      }
    } catch (error) {
      console.error("Error getting project state:", error);
    }
    return {};
  }

  private async saveProjectState(state: Record<string, any>): Promise<void> {
    try {
      const stateJson = JSON.stringify(state);
      const timestamp = Date.now();
      
      const existing = await this.sql`
        SELECT id FROM project_state
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      
      if (existing && Array.isArray(existing) && existing.length > 0) {
        const id = (existing[0] as any).id;
        await this.sql`
          UPDATE project_state
          SET state = ${stateJson}, updated_at = ${timestamp}
          WHERE id = ${id}
        `;
      } else {
        await this.sql`
          INSERT INTO project_state (state, updated_at)
          VALUES (${stateJson}, ${timestamp})
        `;
      }
    } catch (error) {
      console.error("Error saving project state:", error);
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const { message, conversationId } = body;

      if (!message) {
        return new Response(
          JSON.stringify({ error: "Message is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const context = await this.searchDocumentation(message);
      const conversationHistory = await this.getConversationHistory(conversationId || "default");

      const systemPrompt = `You are an expert Cloudflare developer assistant. Help developers build on Cloudflare's platform.

Documentation context:
${context}`;

      // Try Llama 3.1 8B as fallback if 3.3 isn't available
      let response;
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: message },
          ],
          max_tokens: 2048,
        });
      } catch (error) {
        // Fallback to any available model
        console.error("Model error, trying alternative:", error);
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          prompt: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
          max_tokens: 2048,
        });
        // Convert to message format
        if (response && typeof response === 'string') {
          response = { response };
        }
      }

      const convId = conversationId || `conv_${Date.now()}`;
      await this.saveConversationMessage(convId, "user", message);
      await this.saveConversationMessage(convId, "assistant", response.response || "");

      return new Response(
        JSON.stringify({
          message: response.response || "I couldn't generate a response. Please try again.",
          conversationId: convId,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error in handleChat:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
          message: "Failed to process your message. Please try again.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  private async handleCodeGeneration(request: Request): Promise<Response> {
    try {
      const body = await request.json();
      const { prompt, projectType } = body;

      if (!prompt) {
        return new Response(
          JSON.stringify({ error: "Prompt is required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const context = await this.searchDocumentation(prompt);
      const projectState = await this.getProjectState();

      const systemPrompt = `Generate production-ready Cloudflare Workers code in TypeScript.

Documentation context:
${context}`;

      // Use Llama 3.1 8B (more widely available)
      let response;
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nType: ${projectType}` : ''}` },
          ],
          max_tokens: 4096,
        });
      } catch (error) {
        console.error("Model error:", error);
        // Fallback to prompt format
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          prompt: `${systemPrompt}\n\nUser: Generate code for: ${prompt}${projectType ? `\nType: ${projectType}` : ''}\n\nAssistant:`,
          max_tokens: 4096,
        });
        if (response && typeof response === 'string') {
          response = { response };
        }
      }

      const generatedCode = response.response || "";
      const codeBlocks = this.extractCodeBlocks(generatedCode);

      return new Response(
        JSON.stringify({
          code: codeBlocks,
          config: this.extractConfig(generatedCode),
          explanation: this.extractExplanation(generatedCode),
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Error in handleCodeGeneration:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Unknown error",
          code: [],
          explanation: "Failed to generate code. Please try again.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  private async handleDocumentationSearch(request: Request): Promise<Response> {
    const body = await request.json();
    const { query } = body;

    const context = await this.searchDocumentation(query);

    return new Response(
      JSON.stringify({ context }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  async onWebSocketClose(ws: WebSocket): Promise<void> {
    // Cleanup if needed
  }

  async onWebSocketError(ws: WebSocket, error: Error): Promise<void> {
    console.error("WebSocket error:", error);
  }
}

