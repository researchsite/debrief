import { createHash } from 'node:crypto';
import { query } from './graph';
import type { ClassificationResult } from './classify';
import type { QrProvenance } from './import-types';

export function qrRecordId(filePath: string, payload: string): string {
  return createHash('sha256').update(`${filePath}\0${payload}`).digest('hex');
}
export async function saveQrProvenance(filePath: string, qr: QrProvenance, result: ClassificationResult, personId?: string, graphName?: string): Promise<void> {
  const id = qrRecordId(filePath, qr.payload);
  const resultPath = `${filePath}#qr=${id}`;
  await query(
    `MERGE (a:Asset {file_path:$path}) ON CREATE SET a.kind = 'image', a.extracted_text = ''
     MERGE (q:QrPayload {id:$id}) SET q.payload = $payload, q.source_url = $url, q.resolved_url = $resolvedUrl, q.kind = $kind
     MERGE (a)-[:CONTAINS_QR]->(q)
     MERGE (r:Asset {file_path:$resultPath}) MERGE (q)-[:EXTRACTED_AS]->(r)`,
    { path: filePath, id, payload: qr.payload, url: qr.url || '', resolvedUrl: qr.resolvedUrl || '', kind: result.kind, resultPath }, graphName,
  );
  if (personId) await query('MATCH (q:QrPayload {id:$id}), (p:Person {id:$personId}) MERGE (q)-[:RESOLVES_TO]->(p)', { id, personId }, graphName);
  if (result.kind === 'coupon') await query('MATCH (q:QrPayload {id:$id}), (c:Coupon {code:$code}) MERGE (q)-[:RESOLVES_TO]->(c)', { id, code: result.code }, graphName);
  if (result.kind === 'agenda') for (const session of result.sessions) await query('MATCH (q:QrPayload {id:$id}), (s:Session {title:$title}) MERGE (q)-[:RESOLVES_TO]->(s)', { id, title: session.title }, graphName);
  if (result.kind === 'slide' || result.kind === 'deck') await query('MATCH (q:QrPayload {id:$id}), (s:Session {title:$title}) MERGE (q)-[:RESOLVES_TO]->(s)', { id, title: result.title }, graphName);
}
