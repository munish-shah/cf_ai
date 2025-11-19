import { DeveloperAssistantAgent } from "./agent";
import { populateVectorize } from "../scripts/populate-vectorize";

// Export the Durable Object class so migrations can find it
export { DeveloperAssistantAgent };

export interface Env {
  AI: Ai;
  VECTORIZE_INDEX: VectorizeIndex;
  DEVELOPER_AGENT: DurableObjectNamespace<DeveloperAssistantAgent>;
}

// CORS headers helper
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Populate Vectorize endpoint
    if (url.pathname === "/populate" && request.method === "POST") {
      try {
        await populateVectorize(env);
        return new Response(
          JSON.stringify({ success: true, message: "Vectorize index populated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
    }

    // Route agent requests to Durable Object
    if (url.pathname === "/agent" || url.pathname.startsWith("/agent/")) {
      const id = env.DEVELOPER_AGENT.idFromName("main");
      const stub = env.DEVELOPER_AGENT.get(id);
      
      // Strip /agent prefix and create new request for Durable Object
      const agentPath = url.pathname === "/agent" ? "/" : url.pathname.replace("/agent", "");
      const agentUrl = new URL(agentPath + url.search, url.origin);
      
      const agentRequest = new Request(agentUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      
      const response = await stub.fetch(agentRequest);
      
      // Add CORS headers to the response
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
};

