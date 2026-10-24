'use client';

import { useState } from 'react';
import { ClassicEventView } from '@/components/scenes/event/ClassicEventView';
import { EventScene } from '@/components/scenes/event/EventScene';
import { useEventData } from '@/components/scenes/event/useEventData';

export default function EventPage() {
  const data = useEventData();
  const [classic, setClassic] = useState(false);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setClassic((v) => !v)}
        className="px-chip absolute top-2 right-2 z-50 bg-[var(--px-paper)] text-[var(--px-ink)] !py-0.5 cursor-pointer"
        aria-pressed={classic}
      >
        {classic ? 'Dial view' : 'Classic view'}
      </button>
      {classic ? <div className="pt-8"><ClassicEventView data={data} /></div> : <EventScene data={data} />}
    </div>
  );
}
