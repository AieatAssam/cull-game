import type { InputFrame } from '../sim/types';

export interface ReplayData { seed: number; frames: InputFrame[]; }
type InputTuple = [number, number, number, -1 | 0 | 1, 0 | 1, 0 | 1];
const maxFrames = 8 * 60 * 60;
// Base64url of the worst-case eight-minute stream fits under this bound.
// Highly varying input logs do not benefit from RLE and exceed 100 KB.
const maxEncodedLength = 1_500_000;

function tuple(frame: InputFrame): InputTuple {
  const fields = [frame.panX, frame.panZ, frame.zoom];
  if (fields.some((value) => !Number.isInteger(value) || value < -127 || value > 127)) throw new RangeError('Replay input axes must be int8 values');
  if (![0, -1, 1].includes(frame.rotate) || typeof frame.hold !== 'boolean' || typeof frame.steady !== 'boolean') throw new RangeError('Invalid replay input flags');
  return [frame.panX, frame.panZ, frame.zoom, frame.rotate, Number(frame.hold) as 0 | 1, Number(frame.steady) as 0 | 1];
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new TypeError('Replay URL contains invalid base64url characters');
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeReplay(seed: number, frames: readonly InputFrame[]): string {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Replay seed must be uint32');
  if (frames.length > maxFrames) throw new RangeError('Replay exceeds the eight-minute input limit');
  const runs: Array<[number, ...InputTuple]> = [];
  for (const frame of frames) {
    const current = tuple(frame);
    const previous = runs.at(-1);
    if (previous && previous.slice(1).every((value, index) => value === current[index]) && previous[0] < maxFrames) previous[0]++;
    else runs.push([1, ...current]);
  }
  return encodeBase64Url(JSON.stringify({ v: 1, seed: seed >>> 0, runs }));
}

export function decodeReplay(encoded: string): ReplayData {
  if (!encoded || encoded.length > maxEncodedLength) throw new RangeError('Replay URL is empty or too large');
  const payload: unknown = JSON.parse(decodeBase64Url(encoded));
  if (!payload || typeof payload !== 'object') throw new TypeError('Malformed replay payload');
  const value = payload as { v?: unknown; seed?: unknown; runs?: unknown };
  if (value.v !== 1 || !Number.isInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) > 0xffffffff || !Array.isArray(value.runs)) throw new TypeError('Unsupported replay payload');
  const frames: InputFrame[] = [];
  for (const run of value.runs) {
    if (!Array.isArray(run) || run.length !== 7 || !Number.isInteger(run[0]) || run[0] < 1 || run[0] > maxFrames) throw new TypeError('Malformed replay run');
    const [, panX, panZ, zoom, rotate, hold, steady] = run;
    const decoded = tuple({ panX, panZ, zoom, rotate, hold: hold === 1, steady: steady === 1 });
    if (![0, 1].includes(hold) || ![0, 1].includes(steady)) throw new TypeError('Malformed replay flags');
    if (frames.length + run[0] > maxFrames) throw new RangeError('Replay exceeds the eight-minute input limit');
    for (let i = 0; i < run[0]; i++) frames.push({ panX: decoded[0], panZ: decoded[1], zoom: decoded[2], rotate: decoded[3], hold: decoded[4] === 1, steady: decoded[5] === 1 });
  }
  return { seed: value.seed as number, frames };
}
