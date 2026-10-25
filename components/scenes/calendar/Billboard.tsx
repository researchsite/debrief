import Link from 'next/link';
import type { TimelineEntry } from '@/lib/graph-writes';
import { entryKey, relativeTime, type DaySection } from './timeline';
import styles from './styles';

export type BoardState = 'loading' | 'error' | 'ready';

interface BillboardProps {
  state: BoardState;
  event: { eventName: string; primaryIntent: string } | null;
  sections: DaySection[];
  /** Time the data was loaded; relative times are computed against it. */
  now: number;
  onRetry: () => void;
}

const ICONS: Record<TimelineEntry['type'], string> = {
  person: '👤',
  talk: '🎤',
  coupon: '🎟️',
  plan: '🗓️',
};

export function Billboard({ state, event, sections, now, onRetry }: BillboardProps) {
  const isEmpty = state === 'ready' && sections.every((s) => s.entries.length === 0);

  return (
    <section className={styles.billboard} aria-label="Schedule board">
      <div className={styles.screen}>
        <span className={styles.glare} aria-hidden="true" />
        <header className={styles.boardHeader}>
          <p className={styles.eventName}>{event?.eventName ?? 'Your conference'}</p>
          {event?.primaryIntent && (
            <span className={styles.intentChip}>{event.primaryIntent}</span>
          )}
        </header>

        <div className={styles.boardScroll}>
          {state === 'loading' && (
            <div className={styles.boardCenter} role="status">
              <div className={styles.spinner} aria-hidden="true" />
              <p>Loading board...</p>
            </div>
          )}

          {state === 'error' && (
            <div className={styles.boardCenter} role="alert">
              <p className={styles.errorText}>Board offline</p>
              <p>Could not load today&apos;s timeline.</p>
              <button type="button" className={styles.btn} onClick={onRetry}>
                Retry
              </button>
            </div>
          )}

          {state === 'ready' && isEmpty && (
            <div className={styles.boardCenter}>
              <p>Nothing captured yet today. Tap + to add your first person or talk.</p>
            </div>
          )}

          {state === 'ready' &&
            !isEmpty &&
            sections.map((section) => (
              <div key={section.key} className={styles.daySection}>
                <h2 className={styles.dayLabel}>{section.label}</h2>
                {section.entries.length === 0 ? (
                  <p className={styles.emptyLine}>
                    {section.key === 'today' ? 'Nothing captured yet today.' : 'Nothing scheduled yet'}
                  </p>
                ) : (
                  <ul className={styles.rows}>
                    {section.entries.map((entry) => (
                      <li key={entryKey(entry)}>
                        <BoardRow entry={entry} now={now} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

function BoardRow({ entry, now }: { entry: TimelineEntry; now: number }) {
  const content = (
    <>
      <span className={styles.rowIcon} aria-hidden="true">
        {ICONS[entry.type]}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>
          {entry.title}
          {entry.sample && <span className="cal-sample-tag">Sample</span>}
        </span>
        {entry.subtitle && <span className={styles.rowSub}>{entry.subtitle}</span>}
      </span>
      <span className={styles.rowTime}>{relativeTime(entry.timestamp, now)}</span>
    </>
  );

  if (entry.url) {
    return (
      <Link href={entry.url} className={`${styles.row} ${styles.rowLink}`}>
        {content}
      </Link>
    );
  }
  return <div className={styles.row}>{content}</div>;
}
