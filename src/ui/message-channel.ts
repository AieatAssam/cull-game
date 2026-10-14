/**
 * The one HUD message line. Every caption source (danger, coach/tutorial text, the most urgent incoming
 * threat, shot-size advice, idle tips) offers a line each frame; the channel shows one at a time.
 * Higher priority preempts at once; otherwise a line holds for a minimum dwell, and a line that was just
 * replaced is not shown again within the de-dupe window. Render/UI only: it never reads or writes the sim.
 */
export type MessagePriority = 'danger' | 'tutorial' | 'threat' | 'shot' | 'tip';

const RANK: Record<MessagePriority, number> = { danger: 4, tutorial: 3, threat: 2, shot: 1, tip: 0 };

export interface MessageOffer {
  text: string;
  priority: MessagePriority;
  /** Identity for de-dupe and dwell when the text itself changes every frame (a countdown). Defaults to the text. */
  key?: string;
}

export interface ShownMessage { text: string; priority: MessagePriority; key: string; }

export class MessageChannel {
  private current: (ShownMessage & { since: number }) | null = null;
  private readonly lastShown = new Map<string, number>();

  constructor(private readonly minDwellMs = 1200, private readonly dedupeMs = 4000) {}

  /** Picks the line to show at `now` (ms) from this frame's offers. */
  update(offers: ReadonlyArray<MessageOffer>, now: number): ShownMessage | null {
    const ranked = offers.filter((offer) => offer.text)
      .map((offer, index) => ({ ...offer, key: offer.key ?? offer.text, index }))
      .sort((a, b) => RANK[b.priority] - RANK[a.priority] || a.index - b.index);
    const current = this.current;
    const still = current && ranked.find((offer) => offer.key === current.key);
    if (current) this.lastShown.set(current.key, now);
    const fresh = ranked.filter((offer) => offer.key === current?.key || offer.priority === 'danger' || offer.priority === 'tutorial'
      || now - (this.lastShown.get(offer.key) ?? -Infinity) >= this.dedupeMs);
    const best = fresh[0] ?? (still ? undefined : ranked[0]);
    if (!best) return current && this.show(still ?? current, current.since);
    if (current && best.key === current.key) return this.show(best, current.since);
    const dwelling = current && now - current.since < this.minDwellMs;
    // A line still dwelling holds unless something more urgent arrives; a line no longer offered still finishes its dwell.
    if (current && dwelling && RANK[best.priority] <= RANK[current.priority]) return this.show(still ?? current, current.since);
    return this.show(best, now);
  }

  reset() { this.current = null; this.lastShown.clear(); }

  private show(message: ShownMessage, since: number): ShownMessage {
    this.current = { text: message.text, priority: message.priority, key: message.key, since };
    return { text: message.text, priority: message.priority, key: message.key };
  }
}
