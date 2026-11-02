import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
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
  const reload = useCallback(() => {
    api<Branding>('/branding').then(setBranding, () => setBranding(DEFAULT));
  }, []);
  useEffect(reload, [reload]);

  useEffect(() => {
    document.title = branding.appName;
    const root = document.documentElement;
    if (branding.brandColor) root.style.setProperty('--brand', branding.brandColor);
    else root.style.removeProperty('--brand');
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = branding.logoUrl ?? '/favicon.svg';
  }, [branding]);

  return <BrandingContext.Provider value={{ branding, reload }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
