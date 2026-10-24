import { FalkorDB, Graph } from 'falkordb';
import type { QueryParams } from 'falkordb';
import type { GraphReply } from 'falkordb/dist/src/graph';

// Use GraphReply with a generic record for query results
export type QueryResult = GraphReply<Record<string, unknown>>;

const host = process.env.FALKORDB_HOST ?? 'localhost';
const port = parseInt(process.env.FALKORDB_PORT ?? '6379', 10);

// Cache only the DB connection — never cache the Graph handle.
// The Graph object tracks server schema version; caching it causes
// "ERR invalid graph version" when the graph is modified externally
// (e.g. by seed scripts running in a separate process).
let dbClient: FalkorDB | null = null;

async function getDb(): Promise<FalkorDB> {
  if (!dbClient) {
    const url = process.env.FALKORDB_URL;
    dbClient = await FalkorDB.connect(
      url ? { url } : { socket: { host, port } },
    );
  }
  return dbClient;
}

export async function getGraph(name?: string): Promise<Graph> {
  const graphName = name ?? process.env.FALKORDB_GRAPH ?? 'debrief';
  const db = await getDb();
  return db.selectGraph(graphName);
}

export async function query(
  cypher: string,
  params?: Record<string, unknown>,
  graphName?: string,
): Promise<QueryResult> {
  const graph = await getGraph(graphName);
  return graph.query<Record<string, unknown>>(cypher, {
    params: params as QueryParams,
  });
}

export async function roQuery(
  cypher: string,
  params?: Record<string, unknown>,
  graphName?: string,
): Promise<QueryResult> {
  const graph = await getGraph(graphName);
  return graph.roQuery<Record<string, unknown>>(cypher, {
    params: params as QueryParams,
  });
}
