import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { CandidatePhoto } from '../../components/CandidatePhoto';

export interface PairCandidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
}

export interface PairRound {
  id: number;
  name: string;
  entries: number;
  pairs: { id: number; a: PairCandidate; b: PairCandidate; myVote: number | null }[];
  voted: number;
  submitted: boolean;
}

const timeFmt = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** A pair-vote round (Deba Teh): the judge picks one winner in each pair, then submits all votes at once. */
export function PairVotePanel({ round, onChange }: { round: PairRound; onChange: () => void }) {
  const [votes, setVotes] = useState<Record<number, number | null>>({});
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string }>({ kind: 'idle' });

  // The server's votes win whenever the sheet reloads.
  useEffect(() => setVotes(Object.fromEntries(round.pairs.map((p) => [p.id, p.myVote]))), [round]);

  const locked = round.submitted;
  const voted = round.pairs.filter((p) => votes[p.id] != null).length;
  const missing = round.pairs.length - voted;

  async function vote(pairId: number, winnerId: number) {
    const before = votes[pairId] ?? null;
    setVotes((v) => ({ ...v, [pairId]: winnerId }));
    try {
      await api('/judge/votes', { method: 'PUT', body: JSON.stringify({ pairId, winnerId }) });
      setStatus({ kind: 'saved', at: new Date() });
      onChange();
    } catch (err) {
      setVotes((v) => ({ ...v, [pairId]: before }));
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save your vote' });
    }
  }

  async function submit() {
    if (!confirm(`Submit your ${round.pairs.length} votes in ${round.name}? They lock, and only the tabulator can let you change them.`)) return;
    try {
      await api(`/judge/rounds/${round.id}/submit-votes`, { method: 'POST' });
      onChange();
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Could not submit' });
    }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{round.name}</h1>
          <p className="sub">
            {locked
              ? 'Submitted. Your votes are locked; ask the tabulator if one needs changing.'
              : round.pairs.length === 0
                ? 'The tabulator is setting the pairs. Check again in a moment.'
                : `Pick the winner of each pair. ${voted} of ${round.pairs.length} pairs voted.`}
          </p>
        </div>
        <div className="actions">
          <span className={status.kind === 'error' ? 'error' : 'meta'} aria-live="polite">
            {status.kind === 'saved' && `Saved ${timeFmt.format(status.at)}`}
            {status.kind === 'error' && status.message}
          </span>
          {!locked && round.pairs.length > 0 && (
            <button className="btn primary" onClick={submit} disabled={missing > 0}>
              Submit votes
            </button>
          )}
          {round.pairs.length === 0 && (
            <button className="btn" onClick={onChange}>
              Check again
            </button>
          )}
        </div>
      </div>
      {!locked && missing > 0 && round.pairs.length > 0 && (
        <p className="meta" style={{ marginBottom: 12 }}>
          You can submit once every pair has a winner: {missing} to go.
        </p>
      )}

      <ol className="pairs">
        {round.pairs.map((p, i) => (
          <li key={p.id} className="pair">
            <span className="pair-label">Pair {i + 1}</span>
            {[p.a, p.b].map((c, side) => (
              <PickButton key={c.id} candidate={c} picked={votes[p.id] === c.id} other={side === 0 ? p.b.name : p.a.name} disabled={locked} onPick={() => vote(p.id, c.id)} />
            ))}
          </li>
        ))}
      </ol>
    </>
  );
}

function PickButton({ candidate, picked, other, disabled, onPick }: { candidate: PairCandidate; picked: boolean; other: string; disabled: boolean; onPick: () => void }) {
  return (
    <button className="pick" aria-pressed={picked} disabled={disabled} onClick={onPick} aria-label={`${candidate.name} wins over ${other}`}>
      <CandidatePhoto src={candidate.thumbUrl} name={candidate.name} size={48} />
      <span className="pick-text">
        <span className="name">{candidate.name}</span>
        <span className="sub">No. {candidate.number}</span>
      </span>
      <span className="pick-mark">{picked ? 'Winner' : 'Pick'}</span>
    </button>
  );
}
