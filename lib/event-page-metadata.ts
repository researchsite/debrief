interface LumaPage {
  props?: { pageProps?: { initialData?: { data?: { event?: {
    name?: string;
    start_at?: string;
    timezone?: string;
    geo_address_info?: { full_address?: string };
  } } } } };
}

/** Read the authoritative local date before HTML stripping removes page scripts. */
export function eventPageMetadata(html: string): { name?: string; date?: string; venue?: string } {
  const script = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return {};
  try {
    const page: LumaPage = JSON.parse(script[1]);
    const event = page.props?.pageProps?.initialData?.data?.event;
    if (!event) return {};
    const result: { name?: string; date?: string; venue?: string } = {};
    if (event.name?.trim()) result.name = event.name.trim();
    if (event.geo_address_info?.full_address) result.venue = event.geo_address_info.full_address;
    if (event.start_at && event.timezone) {
      result.date = new Intl.DateTimeFormat('en-CA', {
        timeZone: event.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(event.start_at));
    }
    return result;
  } catch {
    return {};
  }
}
