import { memo, useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { CandidatePhoto } from '../../components/CandidatePhoto';
import { Pagination } from '../../components/Pagination';
import { useAutoInputShortcuts } from '../../hooks/useAutoInputShortcuts';

interface Criterion {
  id: number;
  name: string;
  min: number;
  max: number;
}

interface Candidate {
  id: number;
  number: number;
  name: string;
  thumbUrl: string | null;
}

// Sample data until the scoring API exists: 120 candidates to prove the sheet stays smooth at scale.
const criteria: Criterion[] = [
  { id: 1, name: 'Poise', min: 1, max: 10 },
  { id: 2, name: 'Delivery', min: 1, max: 10 },
  { id: 3, name: 'Confidence', min: 1, max: 10 },
];
const candidates: Candidate[] = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  name: `Candidate ${i + 1}`,
  thumbUrl: null,
}));

type Points = number | '';
type Sheet = Record<number, Record<number, Points>>;

interface RowProps {
  candidate: Candidate;
  values: Record<number, Points> | undefined;
  onChange: (candidateId: number, criterionId: number, value: Points) => void;
}

// Memoized row: typing in one input re-renders that row only, not the whole sheet.
const ScoreRow = memo(function ScoreRow({ candidate, values, onChange }: RowProps) {
  return (
    <tr>
      <td>
        <CandidatePhoto src={candidate.thumbUrl} name={candidate.name} size={40} />
      </td>
      <td>{candidate.number}</td>
      <td>{candidate.name}</td>
      {criteria.map((cr) => {
        const value = values?.[cr.id] ?? '';
        const invalid = value !== '' && (value < cr.min || value > cr.max);
        return (
          <td key={cr.id}>
            <input
              type="number"
              inputMode="decimal"
              min={cr.min}
              max={cr.max}
              value={value}
              aria-invalid={invalid}
              aria-label={`${cr.name} for ${candidate.name}`}
              onChange={(e) => onChange(candidate.id, cr.id, e.target.value === '' ? '' : Number(e.target.value))}
            />
          </td>
        );
      })}
    </tr>
  );
});

export function ScoreSheetPage() {
  const { user, logout } = useAuth();
  const [sheet, setSheet] = useState<Sheet>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // Comes from the event's testingMode flag once the API is wired.
  const testingMode = true;

  const visible = useMemo(() => candidates.slice((page - 1) * pageSize, page * pageSize), [page, pageSize]);

  const onChange = useCallback((candidateId: number, criterionId: number, value: Points) => {
    setSheet((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], [criterionId]: value } }));
  }, []);

  // Shortcuts fill the candidates on the current page only.
  const fill = useCallback(
    (pick: (cr: Criterion, current: Points | undefined) => Points) =>
      setSheet((prev) => {
        const next = { ...prev };
        for (const c of visible) {
          next[c.id] = { ...next[c.id] };
          for (const cr of criteria) next[c.id][cr.id] = pick(cr, next[c.id][cr.id]);
        }
        return next;
      }),
    [visible],
  );
  const handlers = useMemo(
    () => ({
      random: () =>
        fill((cr, current) =>
          current === undefined || current === '' ? cr.min + Math.floor(Math.random() * (cr.max - cr.min + 1)) : current,
        ),
      perfect: () => fill((cr) => cr.max),
    }),
    [fill],
  );
  useAutoInputShortcuts(testingMode, handlers);

  const scored = candidates.filter((c) => criteria.every((cr) => sheet[c.id]?.[cr.id] !== undefined && sheet[c.id][cr.id] !== '')).length;

  return (
    <div className="judge">
      <header className="judge-head">
        <strong>{user?.name}</strong>
        <span className="muted">
          Scored {scored} of {candidates.length}
        </span>
        {testingMode && <span className="badge">TEST MODE: Shift + J random, Shift + P perfect</span>}
        <button onClick={logout}>Log out</button>
      </header>
      <table>
        <thead>
          <tr>
            <th>Photo</th>
            <th>No.</th>
            <th>Candidate</th>
            {criteria.map((cr) => (
              <th key={cr.id}>
                {cr.name} ({cr.min}-{cr.max})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <ScoreRow key={c.id} candidate={c} values={sheet[c.id]} onChange={onChange} />
          ))}
        </tbody>
      </table>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={candidates.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
