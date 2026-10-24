import { FalkorDB, Graph } from 'falkordb';
import type { QueryParams } from 'falkordb';
import type { GraphReply } from 'falkordb/dist/src/graph';

// Use GraphReply with a generic record for query results
export type QueryResult = GraphReply<Record<string, unknown>>;

const host = process.env.FALKORDB_HOST ?? 'localhost';
const port = parseInt(process.env.FALKORDB_PORT ?? '6379', 10);

// Singleton cache: graphName -> Graph instance
const graphCache = new Map<string, Graph>();
let dbClient: FalkorDB | null = null;

async function getDb(): Promise<FalkorDB> {
  if (!dbClient) {
    dbClient = await FalkorDB.connect({ socket: { host, port } });
  }
  return dbClient;
}

export async function getGraph(name?: string): Promise<Graph> {
  const graphName = name ?? process.env.FALKORDB_GRAPH ?? 'debrief';
  const cached = graphCache.get(graphName);
  if (cached) return cached;

  const db = await getDb();
  const graph = db.selectGraph(graphName);
  graphCache.set(graphName, graph);
  return graph;
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
