export function formatRelativeTime(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min.toString()} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr.toString()} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day.toString()} day${day === 1 ? '' : 's'} ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month.toString()} month${month === 1 ? '' : 's'} ago`;
  const year = Math.round(month / 12);
  return `${year.toString()} year${year === 1 ? '' : 's'} ago`;
}

export function formatExactTime(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}
