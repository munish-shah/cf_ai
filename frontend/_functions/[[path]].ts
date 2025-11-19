// Proxy agent requests from Pages to the Worker Durable Object
export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  
  // Route agent requests to the Durable Object
  if (url.pathname.startsWith('/agent')) {
    const agentUrl = new URL(context.request.url);
    agentUrl.pathname = agentUrl.pathname.replace('/agent', '');
    
    const env = context.env as any;
    if (env.DEVELOPER_AGENT) {
      const id = env.DEVELOPER_AGENT.idFromName("main");
      const stub = env.DEVELOPER_AGENT.get(id);
      return stub.fetch(new Request(agentUrl.toString(), context.request));
    }
    
    return new Response("Agent not available", { status: 503 });
  }
  
  return context.next();
};

