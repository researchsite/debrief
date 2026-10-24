import { Suspense } from 'react';
import { roQuery } from '@/lib/graph';
import type { ContextBullet } from '@/lib/graph-writes';
import PersonPageClient from './PersonPageClient';

interface Props {
  params: Promise<{ url: string }>;
}

async function PersonData({ paramsPromise }: { paramsPromise: Promise<{ url: string }> }) {
  const { url } = await paramsPromise;

  let linkedinUrl: string;
  try {
    linkedinUrl = Buffer.from(decodeURIComponent(url), 'base64').toString('utf-8');
  } catch {
    return <div className="px-4 py-6">Invalid person URL.</div>;
  }

  const result = await roQuery(
    `MATCH (p:Person) WHERE p.linkedin_url = $url OR p.id = $url
     OPTIONAL MATCH (p)-[:HAS_NOTE]->(n:Note)
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     OPTIONAL MATCH (p)-[:HAS_CONTEXT]->(ctx:Context)
     OPTIONAL MATCH (ctx)-[:CITES]->(src:Source)
     RETURN p.name AS name, p.headline AS headline, p.city AS city, p.linkedin_url AS linkedinUrl, p.email AS email, p.phone AS phone,
            collect(DISTINCT {text: n.text, created_at: n.created_at}) AS notes,
            c.name AS company,
            ctx.summary AS contextSummary,
            ctx.bullets AS contextBullets,
            ctx.fetched_at AS contextFetchedAt,
            collect(DISTINCT {url: src.url, title: src.title}) AS sources`,
    { url: linkedinUrl },
    'debrief',
  );

  const row = result.data?.[0];
  if (!row || row.name == null) {
    return (
      <div className="px-4 py-6 max-w-[500px] mx-auto">
        <p className="text-muted-foreground">Person not found.</p>
      </div>
    );
  }

  // Parse context bullets
  let contextBullets: ContextBullet[] = [];
  if (row.contextBullets) {
    try {
      contextBullets = JSON.parse(String(row.contextBullets)) as ContextBullet[];
    } catch {
      contextBullets = [];
    }
  }

  // Filter null notes and sources
  const notes = ((row.notes as { text: string; created_at: number }[]) ?? []).filter(
    (n) => n.text != null,
  );
  const sources = ((row.sources as { url: string; title: string }[]) ?? []).filter(
    (s) => s.url != null,
  );

  const hasContext = row.contextSummary != null;

  return (
    <PersonPageClient
      encodedUrl={Buffer.from(linkedinUrl).toString('base64url')}
      linkedinUrl={String(row.linkedinUrl ?? '')}
      name={String(row.name ?? '')}
      headline={String(row.headline ?? '')}
      city={String(row.city ?? '')}
      company={String(row.company ?? '')}
      email={String(row.email ?? '')}
      phone={String(row.phone ?? '')}
      notes={notes}
      hasContext={hasContext}
      contextSummary={hasContext ? String(row.contextSummary) : null}
      contextBullets={hasContext ? contextBullets : null}
      contextFetchedAt={hasContext ? Number(row.contextFetchedAt ?? 0) : null}
      sources={sources}
    />
  );
}

export default function PersonPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 max-w-[500px] mx-auto">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-1/2 rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        </div>
      }
    >
      <PersonData paramsPromise={params} />
    </Suspense>
  );
}
