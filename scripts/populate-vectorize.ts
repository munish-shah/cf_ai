// Script to populate Vectorize index with Cloudflare documentation
// Run this after creating your Vectorize index

interface DocChunk {
  id: string;
  values: number[];
  metadata: {
    title: string;
    content: string;
    url: string;
    section?: string;
  };
}

const cloudflareDocs = [
  {
    title: "Getting Started with Workers",
    content: "Cloudflare Workers provides a serverless execution environment that allows you to create entirely new applications or augment existing ones without configuring or maintaining infrastructure. Workers run on Cloudflare's edge network in over 300 cities worldwide, enabling you to build applications that are close to your users.",
    url: "https://developers.cloudflare.com/workers/",
    section: "basics"
  },
  {
    title: "D1 Database",
    content: "D1 is Cloudflare's SQLite database that runs at the edge. It provides a SQL database with global replication, automatic backups, and serverless scaling. Use D1 for structured data storage with SQL queries. Bind D1 to your Worker using wrangler.toml bindings.",
    url: "https://developers.cloudflare.com/d1/",
    section: "storage"
  },
  {
    title: "R2 Object Storage",
    content: "R2 is Cloudflare's object storage service, compatible with S3 APIs. It provides unlimited egress with no per-request charges. Use R2 for storing files, images, videos, and other unstructured data. Bind R2 buckets to Workers using wrangler.toml.",
    url: "https://developers.cloudflare.com/r2/",
    section: "storage"
  },
  {
    title: "KV Key-Value Store",
    content: "KV is Cloudflare's key-value database that provides low-latency, eventually consistent storage. KV is ideal for caching, session storage, and configuration data. KV supports high read volumes and is optimized for edge computing.",
    url: "https://developers.cloudflare.com/kv/",
    section: "storage"
  },
  {
    title: "Vectorize Vector Database",
    content: "Vectorize is Cloudflare's vector database for building AI applications. It enables semantic search, similarity matching, and RAG (Retrieval Augmented Generation) patterns. Vectorize supports high-dimensional vectors and is optimized for Workers AI embeddings.",
    url: "https://developers.cloudflare.com/vectorize/",
    section: "ai"
  },
  {
    title: "Workers AI",
    content: "Workers AI provides serverless GPU inference on Cloudflare's edge network. Access popular models like Llama, Mistral, and embedding models without managing infrastructure. Workers AI supports text generation, embeddings, image classification, and more.",
    url: "https://developers.cloudflare.com/workers-ai/",
    section: "ai"
  },
  {
    title: "Durable Objects",
    content: "Durable Objects provide strongly consistent, stateful coordination for Cloudflare Workers. Each Durable Object is a JavaScript class instance with its own state, guaranteed to run on a single machine. Use Durable Objects for real-time features, coordination, and stateful applications.",
    url: "https://developers.cloudflare.com/durable-objects/",
    section: "compute"
  },
  {
    title: "Workflows",
    content: "Workflows enable long-running, stateful orchestration for Cloudflare Workers. Workflows guarantee execution, support automatic retries, and can run for minutes, hours, or days. Use Workflows for complex multi-step processes, ETL pipelines, and coordination tasks.",
    url: "https://developers.cloudflare.com/workflows/",
    section: "compute"
  },
  {
    title: "wrangler.toml Configuration",
    content: "wrangler.toml is the configuration file for Cloudflare Workers projects. Define bindings for D1, R2, KV, Vectorize, Durable Objects, and other services. Configure routes, environment variables, and deployment settings. Use 'wrangler dev' for local development and 'wrangler deploy' for production.",
    url: "https://developers.cloudflare.com/workers/wrangler/configuration/",
    section: "configuration"
  },
  {
    title: "Pages",
    content: "Cloudflare Pages is a JAMstack platform for frontend developers. Deploy static sites and full-stack applications with automatic builds, preview deployments, and global CDN. Pages integrates with Workers for serverless functions and edge computing.",
    url: "https://developers.cloudflare.com/pages/",
    section: "hosting"
  },
  {
    title: "TypeScript in Workers",
    content: "Cloudflare Workers support TypeScript out of the box. Use @cloudflare/workers-types for type definitions. Workers run JavaScript/TypeScript code at the edge with V8 isolates. TypeScript provides type safety and better developer experience for Workers development.",
    url: "https://developers.cloudflare.com/workers/configuration/typescript/",
    section: "development"
  },
  {
    title: "WebSockets in Workers",
    content: "Workers support WebSocket connections for real-time communication. Use Durable Objects for WebSocket coordination and state management. WebSockets enable bidirectional communication between clients and Workers at the edge.",
    url: "https://developers.cloudflare.com/workers/learning/using-websockets/",
    section: "networking"
  },
  {
    title: "Agents SDK",
    content: "The Agents SDK enables building AI-powered agents on Cloudflare. Agents provide built-in state management, WebSocket support, SQL database access, and scheduling. Use Agents SDK to build autonomous agents that can perform tasks, communicate in real-time, and persist state.",
    url: "https://developers.cloudflare.com/agents/",
    section: "ai"
  }
];

export async function populateVectorize(env: { AI: Ai; VECTORIZE_INDEX: VectorizeIndex }) {
  const chunks: DocChunk[] = [];

  for (const doc of cloudflareDocs) {
    try {
      const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [doc.content],
      });

      if (embedding && Array.isArray(embedding.data) && embedding.data.length > 0) {
        chunks.push({
          id: `doc-${doc.title.toLowerCase().replace(/\s+/g, '-')}`,
          values: embedding.data[0],
          metadata: {
            title: doc.title,
            content: doc.content,
            url: doc.url,
            section: doc.section,
          },
        });
      }
    } catch (error) {
      console.error(`Error processing ${doc.title}:`, error);
    }
  }

  if (chunks.length > 0) {
    try {
      await env.VECTORIZE_INDEX.insert(chunks);
      console.log(`Successfully inserted ${chunks.length} document chunks`);
    } catch (error) {
      console.error("Error inserting into Vectorize:", error);
    }
  }
}

