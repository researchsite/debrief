import { describe, expect, it } from 'vitest';
import { eventPageMetadata } from '../lib/event-page-metadata';

describe('eventPageMetadata', () => {
  it('preserves the Luma date in its own timezone, even when UTC falls on the next day', () => {
    const page = { props: { pageProps: { initialData: { data: { event: {
      name: 'Conference', start_at: '2026-10-25T02:00:00.000Z', timezone: 'America/Los_Angeles',
      geo_address_info: { full_address: '625 2nd St, San Francisco' },
    } } } } } };
    expect(eventPageMetadata(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(page)}</script>`)).toEqual({
      name: 'Conference', date: '2026-10-24', venue: '625 2nd St, San Francisco',
    });
  });

  it('allows ordinary HTML pages without Luma metadata', () => {
    expect(eventPageMetadata('<h1>Conference</h1>')).toEqual({});
  });

  it('ignores malformed embedded JSON', () => {
    expect(eventPageMetadata('<script id="__NEXT_DATA__">invalid</script>')).toEqual({});
  });
});
