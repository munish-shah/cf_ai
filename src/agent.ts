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

    // Parallelize these operations for faster response
    const [context, conversationHistory] = await Promise.all([
      this.searchDocumentation(message),
      this.getConversationHistory(convId)
    ]);

    // Concise system prompt for faster processing
    // Truncate context if too long to reduce token processing time
    const maxContextLength = 1000;
    const truncatedContext = context.length > maxContextLength 
      ? context.substring(0, maxContextLength) + '...' 
      : context;
    
    // Limit conversation history to last 3 exchanges (6 messages) for faster processing
    const recentHistory = conversationHistory.slice(-6);
    
    const systemPrompt = `You are a Cloudflare developer assistant. Help developers build on Cloudflare's platform.

Knowledge: Workers, Pages, Durable Objects, D1, R2, KV, Vectorize, Workers AI, wrangler.toml.
Provide accurate, production-ready code with TypeScript, error handling, and best practices.

Docs context:
${truncatedContext}

Previous conversation:
${recentHistory.length > 0 ? recentHistory.map(c => `${c.role}: ${c.content}`).join('\n') : 'None'}`;

    let modelUsed = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    let response;
    
    // Use fewer tokens for chat (faster responses), more for code generation
    const maxTokens = message.length > 200 || message.toLowerCase().includes('code') || message.toLowerCase().includes('generate') ? 1536 : 1024;
    
    try {
      response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
        max_tokens: maxTokens,
      });
      console.log(`[WebSocket Chat] Using model: ${modelUsed}`);
    } catch (error) {
      modelUsed = "@cf/meta/llama-3.1-8b-instruct";
      console.warn("Llama 3.3 not available, trying 3.1:", error);
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: message },
          ],
          max_tokens: maxTokens,
        });
        console.log(`[WebSocket Chat] Using model: ${modelUsed} (fallback)`);
      } catch (fallbackError) {
        console.error("Model error, trying prompt format:", fallbackError);
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          prompt: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
          max_tokens: maxTokens,
        });
        console.log(`[WebSocket Chat] Using model: ${modelUsed} (prompt format fallback)`);
        if (response && typeof response === 'string') {
          response = { response };
        }
      }
    }

    const assistantMessage = response.response || "I couldn't generate a response.";
    
    // Save messages in parallel for faster response
    await Promise.all([
      this.saveConversationMessage(convId, "user", message),
      this.saveConversationMessage(convId, "assistant", assistantMessage)
    ]);

    ws.send(JSON.stringify({
      type: "response",
      message: assistantMessage,
      conversationId: convId,
      model: modelUsed,
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

        // Parallelize these operations for faster response
        const [context, projectState] = await Promise.all([
          this.searchDocumentation(prompt),
          this.getProjectState()
        ]);

    ws.send(JSON.stringify({
      type: "progress",
      step: "generating",
      message: "Generating code and configuration...",
    }));

    // Concise system prompt for faster processing
    // Truncate context and project state if too long to reduce token processing time
    const maxContextLength = 1500;
    const truncatedContext = context.length > maxContextLength 
      ? context.substring(0, maxContextLength) + '...' 
      : context;
    
    const projectStateStr = JSON.stringify(projectState, null, 2);
    const maxStateLength = 800;
    const truncatedState = projectStateStr.length > maxStateLength 
      ? projectStateStr.substring(0, maxStateLength) + '...' 
      : projectStateStr;
    
    const systemPrompt = `Generate production-ready TypeScript code for Cloudflare Workers.

Requirements: TypeScript, type definitions, error handling, Cloudflare best practices, wrangler.toml if needed, minimal comments.

Docs context:
${truncatedContext}

Project state:
${truncatedState}`;

    let modelUsed = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    let response;
    try {
      response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nProject type: ${projectType}` : ''}` },
        ],
        max_tokens: 3072,
      });
      console.log(`[WebSocket Code Gen] Using model: ${modelUsed}`);
    } catch (error) {
      modelUsed = "@cf/meta/llama-3.1-8b-instruct";
      console.warn("Llama 3.3 not available, trying 3.1:", error);
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nProject type: ${projectType}` : ''}` },
          ],
          max_tokens: 3072,
        });
        console.log(`[WebSocket Code Gen] Using model: ${modelUsed} (fallback)`);
      } catch (fallbackError) {
        console.error("Model error, trying prompt format:", fallbackError);
        response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          prompt: `${systemPrompt}\n\nUser: Generate code for: ${prompt}${projectType ? `\nType: ${projectType}` : ''}\n\nAssistant:`,
          max_tokens: 3072,
        });
        console.log(`[WebSocket Code Gen] Using model: ${modelUsed} (prompt format fallback)`);
        if (response && typeof response === 'string') {
          response = { response };
        }
      }
    }

    const generatedCode = response.response || "";
    
    const codeBlocks = this.extractCodeBlocks(generatedCode);
    const config = this.extractConfig(generatedCode);
    
    // Preserve original order: explanation with code blocks in their natural positions
    const explanation = this.preserveOrderedContent(generatedCode, codeBlocks);

    ws.send(JSON.stringify({
      type: "complete",
      code: codeBlocks,
      config: config,
      explanation: explanation,
      model: modelUsed,
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

      // Semantic search in Vectorize (reduced topK for faster queries)
      const results = await this.env.VECTORIZE_INDEX.query(
        queryVector.data[0],
        { topK: 3, returnMetadata: true }
      );

      if (!results || results.length === 0) {
        return "No relevant documentation found.";
      }

      // Format results for LLM context (truncate long content for faster processing)
      return results
        .map((result) => {
          const metadata = result.metadata as Record<string, string>;
          const content = metadata.content || result.id || '';
          // Truncate content to ~500 chars per result to reduce token count
          const truncatedContent = content.length > 500 ? content.substring(0, 500) + '...' : content;
          return `Title: ${metadata.title || 'Unknown'}\nContent: ${truncatedContent}\nURL: ${metadata.url || ''}`;
        })
        .join("\n\n---\n\n");
    } catch (error) {
      console.error("Documentation search error:", error);
      return "Error searching documentation.";
    }
  }

  // Parse markdown code blocks from LLM response
  // Handles both named files and anonymous code blocks, preserving order and extracting filenames from context
  private extractCodeBlocks(text: string): Array<{ filename: string; code: string; language: string; order: number }> {
    const codeBlockRegex = /```(\w+)?\s*(?:filename="([^"]+)")?\n([\s\S]*?)```/g;
    const blocks: Array<{ filename: string; code: string; language: string; order: number }> = [];
    let match;
    let order = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || "typescript";
      let filename = match[2] || "";
      
      // If no filename in code block, try to extract from preceding text
      if (!filename) {
        const beforeBlock = text.substring(0, match.index);
        // Look for common patterns like "**filename.ext**", "filename.ext:", "Create filename.ext", etc.
        const filenamePatterns = [
          /\*\*([^\*\n]+\.(ts|js|json|toml|md|txt))\*\*/i,
          /([a-zA-Z0-9_\-\.\/]+\.(ts|js|json|toml|md|txt)):/i,
          /(?:create|add|generate|write|save)\s+([a-zA-Z0-9_\-\.\/]+\.(ts|js|json|toml|md|txt))/i,
          /(?:file|file name|filename)[\s:]+([a-zA-Z0-9_\-\.\/]+\.(ts|js|json|toml|md|txt))/i,
        ];
        
        for (const pattern of filenamePatterns) {
          const filenameMatch = beforeBlock.match(pattern);
          if (filenameMatch) {
            filename = filenameMatch[1];
            break;
          }
        }
        
        // If still no filename and it's wrangler.toml related, infer it
        if (!filename && (beforeBlock.toLowerCase().includes('wrangler') || language === 'toml')) {
          filename = 'wrangler.toml';
        }
        
        // If still no filename, try to infer from language and context
        if (!filename) {
          if (language === 'typescript' || language === 'ts') {
            filename = 'src/index.ts';
          } else if (language === 'json') {
            filename = 'package.json';
          }
        }
      }
      
      blocks.push({
        language,
        filename,
        code: match[3].trim(),
        order: order++,
      });
    }

    // Fallback for malformed code blocks
    if (blocks.length === 0 && text.includes("```")) {
      const fallbackMatch = text.match(/```[\s\S]*?```/);
      if (fallbackMatch) {
        blocks.push({
          language: "typescript",
          filename: "src/index.ts",
          code: fallbackMatch[0].replace(/```\w*\n?/g, "").replace(/```/g, "").trim(),
          order: 0,
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

  // Preserve the original order of text and code blocks
  private preserveOrderedContent(text: string, codeBlocks: Array<{ filename: string; code: string; language: string; order: number }>): string {
    if (codeBlocks.length === 0) {
      return text.trim();
    }

    // Split text by code blocks while preserving order
    const codeBlockRegex = /```(\w+)?\s*(?:filename="([^"]+)")?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    const parts: Array<{ type: 'text' | 'code'; content: string; order?: number }> = [];
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textBefore = text.substring(lastIndex, match.index).trim();
        if (textBefore) {
          parts.push({ type: 'text', content: textBefore });
        }
      }
      
      // Add code block reference
      if (codeIndex < codeBlocks.length) {
        parts.push({ type: 'code', content: '', order: codeIndex });
        codeIndex++;
      }
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex).trim();
      if (remainingText) {
        parts.push({ type: 'text', content: remainingText });
      }
    }

    // Reconstruct with proper formatting, preserving original spacing
    let result = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.type === 'text') {
        // Preserve original spacing - don't add extra newlines
        result += part.content;
        // Add spacing only if next part is code
        if (i < parts.length - 1 && parts[i + 1].type === 'code') {
          result += '\n\n';
        } else if (i < parts.length - 1) {
          result += '\n\n';
        }
      } else if (part.type === 'code' && part.order !== undefined && codeBlocks[part.order]) {
        const block = codeBlocks[part.order];
        const filename = block.filename || 'File';
        // Only add filename header if it's meaningful
        if (filename && filename !== 'File' && filename !== 'src/index.ts') {
          result += `**${filename}**\n\n`;
        }
        result += `\`\`\`${block.language}\n${block.code}\n\`\`\``;
        // Add spacing only if not last part
        if (i < parts.length - 1) {
          result += '\n\n';
        }
      }
    }

    return result.trim();
  }

  private async getConversationHistory(conversationId: string): Promise<Array<{ role: string; content: string }>> {
    try {
      // Limit to 10 most recent messages for faster processing
      const result = await this.sql`
        SELECT role, content FROM conversation_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC
        LIMIT 10
      `;
      // Reverse to get chronological order
      return (result as Array<{ role: string; content: string }>).reverse();
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

      // Parallelize these operations for faster response
      const [context, conversationHistory] = await Promise.all([
        this.searchDocumentation(message),
        this.getConversationHistory(conversationId || "default")
      ]);

      const systemPrompt = `You are an expert Cloudflare developer assistant. Help developers build on Cloudflare's platform.

Documentation context:
${context}`;

      // Try Llama 3.3 first (as recommended), fallback to 3.1 if unavailable
      let response;
      let modelUsed = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: message },
          ],
          max_tokens: 2048,
        });
        console.log(`[HTTP Chat] Using model: ${modelUsed}`);
      } catch (error) {
        // Fallback to Llama 3.1 8B if 3.3 isn't available
        modelUsed = "@cf/meta/llama-3.1-8b-instruct";
        console.warn("Llama 3.3 not available, trying 3.1:", error);
        try {
          response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            messages: [
              { role: "system", content: systemPrompt },
              ...conversationHistory,
              { role: "user", content: message },
            ],
            max_tokens: 2048,
          });
          console.log(`[HTTP Chat] Using model: ${modelUsed} (fallback)`);
        } catch (fallbackError) {
          // Final fallback to prompt format
          console.error("Model error, trying prompt format:", fallbackError);
          response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            prompt: `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
            max_tokens: 2048,
          });
          console.log(`[HTTP Chat] Using model: ${modelUsed} (prompt format fallback)`);
          // Convert to message format
          if (response && typeof response === 'string') {
            response = { response };
          }
        }
      }

      const convId = conversationId || `conv_${Date.now()}`;
      await this.saveConversationMessage(convId, "user", message);
      await this.saveConversationMessage(convId, "assistant", response.response || "");

      return new Response(
        JSON.stringify({
          message: response.response || "I couldn't generate a response. Please try again.",
          conversationId: convId,
          model: modelUsed,
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

      // Parallelize these operations for faster response
      const [context, projectState] = await Promise.all([
        this.searchDocumentation(prompt),
        this.getProjectState()
      ]);

      const systemPrompt = `Generate production-ready Cloudflare Workers code in TypeScript.

Documentation context:
${context}`;

      // Try Llama 3.3 first (as recommended), fallback to 3.1 if unavailable
      let response;
      let modelUsed = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      try {
        response = await this.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nProject type: ${projectType}` : ''}` },
          ],
          max_tokens: 3072,
        });
        console.log(`[Code Generation] Using model: ${modelUsed}`);
      } catch (error) {
        // Fallback to Llama 3.1 8B if 3.3 isn't available
        modelUsed = "@cf/meta/llama-3.1-8b-instruct";
        console.warn("Llama 3.3 not available, trying 3.1:", error);
        try {
          response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Generate code for: ${prompt}${projectType ? `\nProject type: ${projectType}` : ''}` },
            ],
            max_tokens: 3072,
          });
          console.log(`[Code Generation] Using model: ${modelUsed} (fallback)`);
        } catch (fallbackError) {
          // Final fallback to prompt format
          console.error("Model error, trying prompt format:", fallbackError);
          response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            prompt: `${systemPrompt}\n\nUser: Generate code for: ${prompt}${projectType ? `\nType: ${projectType}` : ''}\n\nAssistant:`,
            max_tokens: 3072,
          });
          console.log(`[Code Generation] Using model: ${modelUsed} (prompt format fallback)`);
          if (response && typeof response === 'string') {
            response = { response };
          }
        }
      }

      const generatedCode = response.response || "";
      const codeBlocks = this.extractCodeBlocks(generatedCode);
      const config = this.extractConfig(generatedCode);
      
      // Preserve original order: explanation with code blocks in their natural positions
      const explanation = this.preserveOrderedContent(generatedCode, codeBlocks);

      return new Response(
        JSON.stringify({
          code: codeBlocks,
          config: config,
          explanation: explanation,
          model: modelUsed,
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

