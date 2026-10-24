import { NextRequest, NextResponse } from 'next/server';
import type { ClassificationResult } from '@/lib/classify';
import { writeCoupon, writeAsset } from '@/lib/graph-writes';
import { query } from '@/lib/graph';
import { fetchProfiles } from '@/lib/brightdata';

interface SaveRequest {
  result: ClassificationResult;
  filePath: string;
  eventName?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveRequest;
    const { result, filePath, eventName } = body;

    switch (result.kind) {
      case 'coupon': {
        await writeCoupon({
          code: result.code,
          vendor: result.vendor,
          value: result.value,
          description: result.description,
          expires: result.expires,
          terms: result.terms,
          redeemUrl: result.redeem_url,
          assetPath: filePath,
          eventName,
        });
        break;
      }

      case 'slide':
      case 'deck': {
        await writeAsset({
          kind: result.kind,
          filePath,
          extractedText: result.title,
        });

        // Write Session node
        if (result.title) {
          await query(
            `MERGE (s:Session {title: $title}) SET s.speaker = $speaker`,
            { title: result.title, speaker: result.speaker ?? '' },
          );
        }

        // Write Idea nodes
        for (const idea of result.ideas ?? []) {
          await query(
            `MERGE (i:Idea {text: $text})`,
            { text: idea },
          );
          if (result.title) {
            await query(
              `MATCH (s:Session {title: $title}) MATCH (i:Idea {text: $text}) MERGE (s)-[:HAS_IDEA]->(i)`,
              { title: result.title, text: idea },
            );
          }
        }

        // Write Topic nodes
        for (const topic of result.topics ?? []) {
          const normalized = topic.toLowerCase();
          await query(
            `MERGE (t:Topic {name: $name})`,
            { name: normalized },
          );
          if (result.title) {
            await query(
              `MATCH (s:Session {title: $title}) MATCH (t:Topic {name: $name}) MERGE (s)-[:COVERS]->(t)`,
              { title: result.title, name: normalized },
            );
          }
        }
        break;
      }

      case 'badge':
      case 'business_card': {
        await writeAsset({
          kind: result.kind,
          filePath,
          extractedText: result.name,
        });

        if (result.linkedin_url) {
          // Fire and forget profile fetch
          fetchProfiles([result.linkedin_url]).catch(console.error);
        } else if (result.name) {
          // Write a basic Person node
          await query(
            `MERGE (p:Person {name: $name}) SET p.company = $company, p.job_title = $title`,
            { name: result.name, company: result.company ?? '', title: result.title ?? '' },
          );
        }
        break;
      }

      case 'agenda': {
        await writeAsset({
          kind: 'agenda',
          filePath,
          extractedText: (result.sessions ?? []).map((s) => s.title).join(', '),
        });

        for (const session of result.sessions ?? []) {
          await query(
            `MERGE (s:Session {title: $title}) SET s.starts = $starts, s.room = $room, s.speaker = $speaker`,
            {
              title: session.title,
              starts: session.starts ?? '',
              room: session.room ?? '',
              speaker: session.speaker ?? '',
            },
          );
        }
        break;
      }

      default: {
        await writeAsset({
          kind: 'other',
          filePath,
          extractedText: (result as { text?: string }).text ?? '',
        });
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[save] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 },
    );
  }
}
