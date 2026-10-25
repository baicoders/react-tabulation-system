import { useBranding } from '../branding/BrandingContext';
import { TallyMark } from './TallyMark';

/** The school's logo from Settings, or Tally's mark until one is uploaded. */
export function BrandLogo({ size = 22 }: { size?: number }) {
  const { branding } = useBranding();
  if (!branding.logoUrl) return <TallyMark size={size} />;
  return <img className="brand-logo" src={branding.logoUrl} alt={`${branding.organization ?? branding.appName} logo`} width={size} height={size} />;
}
