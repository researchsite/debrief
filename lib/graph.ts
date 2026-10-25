import { FalkorDB, Graph } from 'falkordb';
import type { QueryParams } from 'falkordb';
import type { GraphReply } from 'falkordb/dist/src/graph';

// Use GraphReply with a generic record for query results
export type QueryResult = GraphReply<Record<string, unknown>>;

const host = process.env.FALKORDB_HOST ?? 'localhost';
const port = parseInt(process.env.FALKORDB_PORT ?? '6379', 10);
const username = process.env.FALKORDB_USERNAME;
const password = process.env.FALKORDB_PASSWORD;
const ssl = process.env.FALKORDB_SSL === 'true';

// Cache only the DB connection — never cache the Graph handle.
// The Graph object tracks server schema version; caching it causes
// "ERR invalid graph version" when the graph is modified externally
// (e.g. by seed scripts running in a separate process).
let dbClient: FalkorDB | null = null;

async function connect(): Promise<FalkorDB> {
  const url = process.env.FALKORDB_URL;
  return FalkorDB.connect(
    url
      ? { url }
      : {
          socket: { host, port, tls: ssl },
          ...(username && { username }),
          ...(password && { password }),
        },
  );
}

async function getDb(): Promise<FalkorDB> {
  if (!dbClient) {
    dbClient = await connect();
  }
  return dbClient;
}

export async function getGraph(name?: string): Promise<Graph> {
  const graphName = name ?? process.env.FALKORDB_GRAPH ?? 'debrief';
  const db = await getDb();
  return db.selectGraph(graphName);
}

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  // Empty message = FalkorDB socket error with no text, or any recognisable connection keyword
  return !msg || msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('socket') || msg.includes('closed') || msg.includes('writeable') || msg.includes('stream');
}

async function executeQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isConnectionError(err)) {
      // Stale connection — clear it and try once more with a fresh connection
      dbClient = null;
      return await fn();
    }
    throw err;
  }
}

export async function query(
  cypher: string,
  params?: Record<string, unknown>,
  graphName?: string,
): Promise<QueryResult> {
  return executeQuery(async () => {
    const graph = await getGraph(graphName);
    return graph.query<Record<string, unknown>>(cypher, { params: params as QueryParams });
  });
}

export async function roQuery(
  cypher: string,
  params?: Record<string, unknown>,
  graphName?: string,
): Promise<QueryResult> {
  return executeQuery(async () => {
    const graph = await getGraph(graphName);
    return graph.roQuery<Record<string, unknown>>(cypher, { params: params as QueryParams });
  });
}
