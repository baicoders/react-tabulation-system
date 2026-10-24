export type Cell = string | number | null;

/**
 * Saves rows as an .xlsx file. SheetJS is loaded only when someone exports, so it stays out of the main bundle.
 * The first row is the header; numbers stay numbers so Excel can sort and sum them.
 */
export async function downloadExcel(fileName: string, sheetName: string, rows: Cell[][], meta: string[] = []) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([...meta.map((m) => [m]), ...(meta.length ? [[]] : []), ...rows]);
  // Column widths from the longest value in each column.
  const widths = rows[0]?.map((_, col) => Math.min(48, Math.max(8, ...rows.map((r) => String(r[col] ?? '').length + 2))));
  if (widths) sheet['!cols'] = widths.map((wch) => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`);
}
