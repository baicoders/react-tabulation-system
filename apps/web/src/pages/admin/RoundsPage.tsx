import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { METHOD_LABEL, TIE_LABEL, type Category, type Round, type RoundKind, type RoundSummary, type ScoreMethod, type TieBreak } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { plural } from '../../lib/format';
import { useAdmin } from './AdminLayout';

export function RoundsPage() {
  const { event, reloadEvent } = useAdmin();
  const rounds = useResource<Round[]>(event ? `/events/${event.id}/rounds` : null);
  const [adding, setAdding] = useState(false);

  if (!event) return <p className="muted">Loading event…</p>;

  const refresh = () => {
    rounds.reload();
    reloadEvent();
  };
  const list = rounds.data ?? [];

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Rounds and criteria</h1>
          <p className="sub">
            {list.length
              ? `${plural(list.length, 'round')}: ${plural(event._count.candidates, 'candidate')}, then ${
                  list.filter((r) => r.advanceCount).map((r) => `Top ${r.advanceCount}`).join(', ') || 'no cuts'
                }.`
              : 'Each round has its own criteria, scoring method and cut.'}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setAdding(true)} disabled={adding}>
            Add round
          </button>
        </div>
      </div>

      {adding && (
        <RoundSettingsForm
          title="New round"
          rounds={list}
          submitLabel="Add round"
          onCancel={() => setAdding(false)}
          onSubmit={async (body) => {
            await api(`/events/${event.id}/rounds`, { method: 'POST', body: JSON.stringify(body) });
            setAdding(false);
            refresh();
          }}
        />
      )}

      {rounds.error && (
        <p className="error">
          Couldn’t load rounds. <button className="link-btn" onClick={rounds.reload}>Retry</button>
        </p>
      )}
      {rounds.data && list.length === 0 && !adding && <div className="empty">No rounds yet. Add the first round, for example the production number.</div>}

      <div className="stack">
        {list.map((r, i) => (
          <RoundPanel key={r.id} round={r} rounds={list} isLast={i === list.length - 1} onChange={refresh} />
        ))}
      </div>
    </section>
  );
}

interface RoundBody {
  name: string;
  kind: RoundKind;
  scoreMethod: ScoreMethod;
  advanceCount: number | null;
  carryOverWeight: number | null;
  dropExtremes: boolean;
  tieBreak: TieBreak;
  basis: { sourceRoundId: number | null; weight: number }[] | null;
}

interface BasisChoice {
  sourceRoundId: number | null;
  name: string;
  on: boolean;
  weight: string;
}

/** What the cut is based on: this round's score, plus any earlier rounds' scores times their weights. */
function CutBasisEditor({ choices, onChange }: { choices: BasisChoice[]; onChange: (next: BasisChoice[]) => void }) {
  const set = (i: number, patch: Partial<BasisChoice>) => onChange(choices.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '16px 0 0' }}>
      <legend style={{ fontWeight: 600, marginBottom: 4 }}>What the cut is based on</legend>
      <p className="muted" style={{ marginBottom: 8 }}>
        By default the Top N are the best of this round alone. Tick earlier rounds to cut on a combined total — for example
        “Basis of Top 5: Gown and Deba Teh”. Each score counts times its weight (scores run out of 100; a pair vote counts votes).
      </p>
      {choices.map((c, i) => (
        <label key={c.sourceRoundId ?? 'self'} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <input type="checkbox" checked={c.on} onChange={(e) => set(i, { on: e.target.checked })} />
          <span style={{ flex: 1 }}>{c.name}</span>
          <span className="muted">×</span>
          <input
            className="input num"
            style={{ width: 72 }}
            type="number"
            min={0.01}
            step="any"
            value={c.weight}
            disabled={!c.on}
            onChange={(e) => set(i, { weight: e.target.value })}
            aria-label={`Weight for ${c.name}`}
          />
        </label>
      ))}
    </fieldset>
  );
}

function RoundSettingsForm({
  title,
  initial,
  rounds,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: Round;
  rounds: RoundSummary[];
  submitLabel: string;
  onSubmit: (body: RoundBody) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<RoundKind>(initial?.kind ?? 'SCORED');
  const [scoreMethod, setScoreMethod] = useState<ScoreMethod>(initial?.scoreMethod ?? 'AVERAGE');
  const [advance, setAdvance] = useState(initial?.advanceCount ? String(initial.advanceCount) : '');
  const [carry, setCarry] = useState(initial?.carryOverWeight ? String(Math.round(initial.carryOverWeight * 100)) : '');
  const [dropExtremes, setDropExtremes] = useState(initial?.dropExtremes ?? false);
  const [tieBreak, setTieBreak] = useState<TieBreak>(initial?.tieBreak ?? 'SHARED_RANK');
  // The cut's basis: this round's own score plus, optionally, earlier rounds' scores. A null sourceRoundId
  // is this round; the server stores it against the round itself.
  const [basis, setBasis] = useState<BasisChoice[]>(() => {
    const earlier = rounds.filter((r) => r.id !== initial?.id && (initial ? r.order < initial.order : true));
    const stored = new Map((initial?.basis ?? []).map((b) => [b.sourceRoundId, b.weight]));
    const self = initial ? stored.get(initial.id) : undefined;
    return [
      { sourceRoundId: null, name: 'This round’s own score', on: initial ? self !== undefined : true, weight: self !== undefined ? String(self) : '1' },
      ...earlier.map((r) => {
        const weight = stored.get(r.id);
        return { sourceRoundId: r.id, name: r.name, on: weight !== undefined, weight: weight !== undefined ? String(weight) : '1' };
      }),
    ];
  });
  // Most rounds need only a name and a cut. The rest opens on request, or by itself when a round already uses it.
  const [more, setMore] = useState(
    Boolean(
      initial &&
        (initial.scoreMethod !== 'AVERAGE' ||
          initial.carryOverWeight ||
          initial.dropExtremes ||
          initial.tieBreak !== 'SHARED_RANK' ||
          (initial.basis ?? []).length > 0),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const picked = basis.filter((c) => c.on).map((c) => ({ sourceRoundId: c.sourceRoundId, weight: Number(c.weight) > 0 ? Number(c.weight) : 1 }));
    try {
      await onSubmit({
        name,
        kind,
        scoreMethod,
        advanceCount: advance ? Number(advance) : null,
        carryOverWeight: carry ? Number(carry) / 100 : null,
        dropExtremes,
        tieBreak,
        basis: picked.length > 0 ? picked : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  return (
    <form className="form-panel" onSubmit={submit}>
      <h2 className="section-title">{title}</h2>
      <div className="form-row">
        <label className="field">
          <span>Round name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production Number" required />
        </label>
        <label className="field">
          <span>Judging</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RoundKind)}>
            <option value="SCORED">Scored on criteria</option>
            <option value="PAIR_VOTE">Pair vote (judges pick a winner)</option>
          </select>
        </label>
        <label className="field">
          <span>Top how many go on</span>
          <input className="input num" type="number" min={1} value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="Empty: final round, or decided by hand" />
        </label>
      </div>
      {more && (
        <>
          {kind === 'SCORED' && (
            <div className="form-row" style={{ marginTop: 16 }}>
              <label className="field">
                <span>Score method</span>
                <select className="input" value={scoreMethod} onChange={(e) => setScoreMethod(e.target.value as ScoreMethod)}>
                  {Object.entries(METHOD_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Carry over from earlier rounds (%)</span>
                <input className="input num" type="number" min={0} max={100} value={carry} onChange={(e) => setCarry(e.target.value)} placeholder="0, start fresh" />
              </label>
              <label className="field">
                <span>Tie at the cut line</span>
                <select className="input" value={tieBreak} onChange={(e) => setTieBreak(e.target.value as TieBreak)}>
                  {Object.entries(TIE_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <CutBasisEditor choices={basis} onChange={setBasis} />
          {kind === 'SCORED' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <input type="checkbox" checked={dropExtremes} onChange={(e) => setDropExtremes(e.target.checked)} />
              Drop each candidate's highest and lowest judge score (needs 5 or more judges)
            </label>
          )}
        </>
      )}
      <button type="button" className="link-btn" style={{ marginTop: 16 }} onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer settings' : kind === 'SCORED' ? 'More settings: score method, carry-over, ties, cut basis' : 'More settings: what the cut is based on'}
      </button>
      {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      <div className="form-actions">
        <button className="btn primary" type="submit">
          {submitLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoundPanel({ round, rounds, isLast, onChange }: { round: Round; rounds: RoundSummary[]; isLast: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  // "Basis of Top 5: Gown and Deba Teh" - the rounds a cut is based on, when not this round alone.
  const basisNames = (round.basis ?? [])
    .filter((b) => b.sourceRoundId !== round.id || b.weight !== 1)
    .map((b) => (b.sourceRoundId === round.id ? round.name : rounds.find((r) => r.id === b.sourceRoundId)?.name ?? 'a missing round'));
  const meta = [
    round.advanceCount ? `Top ${round.advanceCount} go on` : isLast ? 'Final round' : 'Cut decided by hand',
    round.kind === 'PAIR_VOTE' ? 'Pair vote' : METHOD_LABEL[round.scoreMethod],
    round.carryOverWeight ? `${Math.round(round.carryOverWeight * 100)}% carried over` : null,
    round.dropExtremes ? 'Highest and lowest dropped' : null,
    basisNames.length > 0 ? `Cut on ${basisNames.join(' + ')}` : null,
  ].filter(Boolean);

  async function remove() {
    if (!confirm(`Delete the round "${round.name}" with its criteria? Scores already given in it are deleted too.`)) return;
    await api(`/rounds/${round.id}`, { method: 'DELETE' });
    onChange();
  }

  if (editing) {
    return (
      <RoundSettingsForm
        title={`Edit ${round.name}`}
        initial={round}
        rounds={rounds}
        submitLabel="Save round"
        onCancel={() => setEditing(false)}
        onSubmit={async (body) => {
          await api(`/rounds/${round.id}`, { method: 'PATCH', body: JSON.stringify(body) });
          setEditing(false);
          onChange();
        }}
      />
    );
  }

  return (
    <article className="panel">
      <header>
        <div>
          <h2>{round.name}</h2>
          <p className="muted" style={{ marginTop: 2 }}>{meta.join(' · ')}</p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className={round.status === 'OPEN' ? 'pill pos' : 'pill'}>{round.status === 'OPEN' ? 'Open' : round.status === 'CLOSED' ? 'Closed' : 'Not started'}</span>
          <button className="link-btn" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="link-btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      </header>

      {round.kind === 'PAIR_VOTE' ? (
        <p className="muted">Judges pick one winner in each pair. Pairs are set when the round opens; this round has no criteria.</p>
      ) : (
        <>
          {round.categories.map((c) => (
            <CategoryBlock key={c.id} category={c} heading={c.name === round.name ? 'Criterion' : c.name} onChange={onChange} />
          ))}
          {round.categories.length === 0 && <div className="empty">No criteria yet. Add a category, then its criteria.</div>}
          <AddCategoryForm roundId={round.id} onChange={onChange} />
        </>
      )}
    </article>
  );
}

function CategoryBlock({ category, heading, onChange }: { category: Category; heading: string; onChange: () => void }) {
  const weights = category.criteria.map((c) => c.weight);
  const weighted = weights.some((w) => w !== null);
  const total = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);

  async function removeCriterion(id: number) {
    await api(`/criteria/${id}`, { method: 'DELETE' });
    onChange();
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{heading}</th>
              <th className="n">Points</th>
              <th className="n">Weight</th>
              <th className="n">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {category.criteria.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="n">
                  {c.minPoints}-{c.maxPoints}
                </td>
                <td className="n">{c.weight === null ? <span className="muted">Equal</span> : `${c.weight}%`}</td>
                <td className="n">
                  <button className="link-btn quiet" onClick={() => removeCriterion(c.id)} aria-label={`Remove ${c.name}`}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weighted && (
        <p className={total === 100 ? 'meta' : 'error'} style={{ fontSize: 12, marginTop: 4 }}>
          {total === 100 ? 'Weights add up to 100%.' : `Weights add up to ${total}%. They must total 100% before the round opens.`}
        </p>
      )}
      <AddCriterionForm categoryId={category.id} onChange={onChange} />
    </div>
  );
}

function AddCriterionForm({ categoryId, onChange }: { categoryId: number; onChange: () => void }) {
  const [name, setName] = useState('');
  const [min, setMin] = useState('1');
  const [max, setMax] = useState('10');
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/categories/${categoryId}/criteria`, {
        method: 'POST',
        body: JSON.stringify({ name, minPoints: Number(min), maxPoints: Number(max), weight: weight ? Number(weight) : null }),
      });
      setName('');
      setWeight('');
      setError(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add');
    }
  }

  return (
    <form className="toolbar" style={{ marginTop: 8 }} onSubmit={submit}>
      <input className="input" style={{ width: 220 }} placeholder="New criterion" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Criterion name" />
      <input className="input num" style={{ width: 72 }} type="number" min={0} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Min points" />
      <span className="muted">to</span>
      <input className="input num" style={{ width: 72 }} type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} aria-label="Max points" />
      <input className="input num" style={{ width: 96 }} type="number" min={0} max={100} placeholder="Weight %" value={weight} onChange={(e) => setWeight(e.target.value)} aria-label="Weight percent" />
      <button className="btn" type="submit">
        Add criterion
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}

function AddCategoryForm({ roundId, onChange }: { roundId: number; onChange: () => void }) {
  const [name, setName] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    await api(`/rounds/${roundId}/categories`, { method: 'POST', body: JSON.stringify({ name }) });
    setName('');
    onChange();
  }

  return (
    <form className="toolbar" style={{ marginTop: 8, marginBottom: 0 }} onSubmit={submit}>
      <input className="input" style={{ width: 220 }} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Category name" />
      <button className="btn ghost" type="submit">
        Add category
      </button>
    </form>
  );
}
