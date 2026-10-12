export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRange(seed: number, index: number, min: number, max: number): number {
  const random = mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  return min + random() * (max - min);
}
