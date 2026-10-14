/** One inline-SVG icon set for the HUD: 24 px grid, 2 px stroke, square caps, coloured by `currentColor`. */
const svg = (body: string, filled = false) =>
  `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">${body}</svg>`;

export const ICONS = {
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>', true),
  rotateLeft: svg('<path d="M4 4v5h5"/><path d="M5 9a8 8 0 1 1-1 5"/>'),
  rotateRight: svg('<path d="M20 4v5h-5"/><path d="M19 9a8 8 0 1 0 1 5"/>'),
  zoomIn: svg('<path d="M5 12h14M12 5v14"/>'),
  zoomOut: svg('<path d="M5 12h14"/>'),
  share: svg('<path d="M12 4v11M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>'),
  /** The edge pointer for threats and the lost-her arrow: a solid dart pointing along +x, rotated by the caller. */
  arrow: '<svg class="icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M6 4 L28 16 L6 28 L12 16 Z" /></svg>',
} as const;
