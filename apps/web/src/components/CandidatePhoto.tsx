import { memo } from 'react';

interface Props {
  src: string | null;
  name: string;
  size?: number;
}

/**
 * Candidate thumbnail. Lazy-loaded and decoded off the main thread, with a fixed size so the table never
 * jumps while images arrive. Shows initials when there is no picture.
 */
export const CandidatePhoto = memo(function CandidatePhoto({ src, name, size = 48 }: Props) {
  const style = { width: size, height: size };
  if (!src) {
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return (
      <span className="photo photo-empty" style={style} aria-label={name}>
        {initials}
      </span>
    );
  }
  return <img className="photo" src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" />;
});
