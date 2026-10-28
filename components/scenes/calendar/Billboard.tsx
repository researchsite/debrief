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
  /** Set of session titles the user has marked attended. */
  attended?: Set<string>;
  /** Called when user taps the attended button on a session row. */
  onMarkAttended?: (title: string) => void;
}

const ICONS: Record<TimelineEntry['type'], string> = {
  person: '👤',
  talk: '🎤',
  coupon: '🎟️',
  session: '🗓',
};

export function Billboard({ state, event, sections, now, onRetry, attended, onMarkAttended }: BillboardProps) {
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
                    {section.key === 'today' ? 'Nothing captured yet today.' : section.key === 'schedule' ? 'No sessions scheduled.' : 'Nothing scheduled yet'}
                  </p>
                ) : (
                  <ul className={styles.rows}>
                    {section.entries.map((entry) => (
                      <li key={entryKey(entry)}>
                        <BoardRow
                          entry={entry}
                          now={now}
                          isAttended={entry.type === 'session' ? (attended?.has(entry.title) ?? false) : undefined}
                          onMarkAttended={entry.type === 'session' ? onMarkAttended : undefined}
                        />
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

function BoardRow({
  entry,
  now,
  isAttended,
  onMarkAttended,
}: {
  entry: TimelineEntry;
  now: number;
  isAttended?: boolean;
  onMarkAttended?: (title: string) => void;
}) {
  const content = (
    <>
      <span className={styles.rowIcon} aria-hidden="true">
        {ICONS[entry.type]}
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{entry.title}</span>
        {entry.subtitle && <span className={styles.rowSub}>{entry.subtitle}</span>}
      </span>
      <span className={styles.rowTime}>{relativeTime(entry.timestamp, now)}</span>
    </>
  );

  const attendBtn = onMarkAttended && (
    <button
      type="button"
      aria-label={isAttended ? 'Attended' : 'Mark attended'}
      title={isAttended ? 'Attended' : 'Mark attended'}
      onClick={(e) => { e.preventDefault(); if (!isAttended) onMarkAttended(entry.title); }}
      style={{
        marginLeft: 6,
        padding: '2px 7px',
        fontSize: 11,
        fontFamily: 'inherit',
        border: '2px solid currentColor',
        borderRadius: 3,
        background: isAttended ? '#22c55e' : 'transparent',
        color: isAttended ? '#fff' : 'inherit',
        cursor: isAttended ? 'default' : 'pointer',
        flexShrink: 0,
      }}
    >
      {isAttended ? '✓' : '+ Attended'}
    </button>
  );

  if (entry.url) {
    return (
      <div className={styles.row} style={{ display: 'flex', alignItems: 'center' }}>
        <Link href={entry.url} className={styles.rowLink} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {content}
        </Link>
        {attendBtn}
      </div>
    );
  }
  return (
    <div className={styles.row} style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{content}</div>
      {attendBtn}
    </div>
  );
}
