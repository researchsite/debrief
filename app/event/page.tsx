'use client';

import { ClassicEventView } from '@/components/scenes/event/ClassicEventView';
import { EventScene } from '@/components/scenes/event/EventScene';
import { useEventData } from '@/components/scenes/event/useEventData';
import { useViewMode } from '@/hooks/useViewMode';

export default function EventPage() {
  const data = useEventData();
  const { classic, toggle } = useViewMode();

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className="px-chip absolute top-2 right-2 z-50 bg-[var(--px-paper)] text-[var(--px-ink)] !py-0.5 cursor-pointer"
        aria-pressed={classic}
      >
        {classic ? 'Dial view' : 'Classic view'}
      </button>
      {classic ? <div className="pt-8"><ClassicEventView data={data} /></div> : <EventScene data={data} />}
    </div>
  );
}
