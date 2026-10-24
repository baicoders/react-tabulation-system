const dateFmt = new Intl.DateTimeFormat('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });

export function formatDate(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '-';
}

export function formatDateTime(iso: string | null): string {
  return iso ? `${dateFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}` : '-';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-PH')} ${n === 1 ? one : many}`;
}
