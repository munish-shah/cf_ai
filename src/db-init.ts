// Initialize SQLite tables for conversation history and project state
// Called once per Durable Object instance
export async function initializeDatabase(agent: any) {
  try {
    // Store chat messages with conversation grouping
    await agent.sql`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `;

    // Index for faster conversation lookups
    await agent.sql`
      CREATE INDEX IF NOT EXISTS idx_conversation_id 
      ON conversation_messages(conversation_id)
    `;

    // Persist project state between code generation sessions
    await agent.sql`
      CREATE TABLE IF NOT EXISTS project_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

