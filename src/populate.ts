import { populateVectorize } from "../scripts/populate-vectorize";

export interface Env {
  AI: Ai;
  VECTORIZE_INDEX: VectorizeIndex;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === "/populate" && request.method === "POST") {
      try {
        await populateVectorize(env);
        return new Response(
          JSON.stringify({ success: true, message: "Vectorize index populated" }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          }),
          { 
            status: 500,
            headers: { "Content-Type": "application/json" } 
          }
        );
      }
    }
    
    return new Response("Not Found", { status: 404 });
  },
};

