import { useEffect } from 'react';

/**
 * Testing mode shortcuts for the judge score sheet:
 * Shift + J fills empty inputs with random values, Shift + P fills every input with max points.
 * Does nothing when `enabled` is false, so real scores can't be filled by accident.
 */
export function useAutoInputShortcuts(enabled: boolean, handlers: { random: () => void; perfect: () => void }) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'KeyJ') {
        e.preventDefault();
        handlers.random();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        handlers.perfect();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, handlers]);
}
