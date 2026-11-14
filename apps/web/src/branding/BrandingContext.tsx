import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useLocation } from 'react-router-dom';
import type { Branding } from '../api/types';

const DEFAULT: Branding = { appName: 'Tally', organization: null, logoUrl: null, brandColor: null, liveEvent: null };

interface BrandingState {
  branding: Branding;
  reload: () => void;
}

const BrandingContext = createContext<BrandingState>({ branding: DEFAULT, reload: () => {} });

/**
 * The system's identity (the school's name, logo and colour), loaded once for every screen. Sets the tab
 * title, the tab icon and the --brand colour, so screens only need to read it.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT);
  const location = useLocation();
  const reload = useCallback(() => {
    api<Branding>('/branding').then(setBranding, () => setBranding(DEFAULT));
  }, []);
  useEffect(reload, [reload]);

  useEffect(() => {
    const root = document.documentElement;
    if (branding.brandColor) root.style.setProperty('--brand', branding.brandColor);
    else root.style.removeProperty('--brand');
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = branding.logoUrl ?? '/favicon.svg';
  }, [branding]);

  useEffect(() => {
    const path = location.pathname;
    const page = path === '/login' ? 'Log in' : path === '/judge' ? 'Judge' : path === '/admin/events' || path === '/admin' ? 'Events' : path === '/admin/settings' ? 'Settings' :
      /\/admin\/events\/\d+$/.test(path) ? 'Overview' :
      ({ candidates: 'Candidates', groups: 'Groups', rounds: 'Rounds and criteria', judges: 'Judges', details: 'Event details', reports: 'Reports' } as Record<string, string>)[path.split('/').at(-1) ?? ''];
    const views: Record<string, string> = { category: 'By Category', overall: 'Overall Ranking', round: 'By Round', candidate: 'By Candidate', judge: 'By Judge', combined: 'Combined Categories' };
    const view = new URLSearchParams(location.search).get('view') ?? 'category';
    document.title = [branding.appName, page === 'Reports' ? `${page} - ${views[view] ?? views.category}` : page].filter(Boolean).join(' | ');
  }, [branding.appName, location.pathname, location.search]);

  return <BrandingContext.Provider value={{ branding, reload }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
