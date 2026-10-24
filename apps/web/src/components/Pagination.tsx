export const PAGE_SIZES = [10, 20, 50, 100];

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/** Page numbers with the current page in the middle, e.g. 1 ... 4 5 [6] 7 8 ... 20. */
function pageList(page: number, pages: number): (number | '…')[] {
  const around = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2]);
  const list: (number | '…')[] = [];
  let last = 0;
  for (const p of [...around].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)) {
    if (p - last > 1) list.push('…');
    list.push(p);
    last = p;
  }
  return list;
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="pagination" aria-label="Pages">
      <span className="range">
        {from}-{to} of {total}
      </span>
      <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
        Prev
      </button>
      {pageList(page, pages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="muted">
            …
          </span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}>
            {p}
          </button>
        ),
      )}
      <button onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next page">
        Next
      </button>
      {onPageSizeChange && (
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} per page
            </option>
          ))}
        </select>
      )}
    </nav>
  );
}
