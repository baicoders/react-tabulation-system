import { memo, useRef, useState } from 'react';

interface Props {
  src: string | null;
  name: string;
  size?: number;
  photoUrl?: string | null;
  interactive?: boolean;
}

/**
 * Candidate thumbnail. Lazy-loaded and decoded off the main thread, with a fixed size so the table never
 * jumps while images arrive. Shows initials when there is no picture.
 */
export const CandidatePhoto = memo(function CandidatePhoto({ src, name, size = 48, photoUrl, interactive = true }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
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
  const image = <img className="photo" src={src} alt={name} width={size} height={size} loading="lazy" decoding="async" />;
  if (!interactive) return image;
  const full = photoUrl ?? src.replace(/-thumb\.webp(?=\?|$)/, '-full.webp');
  return <>
    <button type="button" className="photo-button" aria-label={`Enlarge photo of ${name}`} onClick={() => { setOpen(true); dialog.current?.showModal(); }}>{image}</button>
    <dialog ref={dialog} className="candidate-photo-dialog" aria-label={`Photo of ${name}`} onClose={() => setOpen(false)}>
      {open && <><div className="title-row"><h2>{name}</h2><button type="button" className="btn" onClick={() => dialog.current?.close()}>Close</button></div><img src={full} alt={name} /></>}
    </dialog>
  </>;
});
