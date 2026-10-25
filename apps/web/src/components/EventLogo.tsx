import { useEffect } from 'react';
import { TallyMark } from './TallyMark';

/** The event's own logo when it has one, Tally's mark otherwise. */
export function EventLogo({ src, name, size = 22 }: { src: string | null | undefined; name?: string; size?: number }) {
  if (!src) return <TallyMark size={size} />;
  return <img className="event-logo" src={src} alt={name ? `${name} logo` : ''} width={size} height={size} />;
}

/** Shows the event's logo as the browser tab icon while a screen is open, then puts Tally's back. */
export function useEventFavicon(src: string | null | undefined) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link || !src) return;
    const original = link.href;
    link.href = src;
    return () => {
      link.href = original;
    };
  }, [src]);
}
