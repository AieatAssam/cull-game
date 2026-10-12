/** Stable date-addressed daily seed; the caller supplies a UTC YYYY-MM-DD string. */
export function dailySeed(utcDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) throw new RangeError('Daily seed needs a UTC YYYY-MM-DD date');
  const date = new Date(`${utcDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== utcDate) throw new RangeError('Invalid UTC date');
  const source = `CULL${utcDate}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}
