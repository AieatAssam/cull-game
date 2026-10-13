import { zoomLogRate } from '../sim/step';
import { TUNING } from '../sim/tuning';

// Human zoom controls (keys, wheel, − + buttons, pinch) all end up here, then go into the sim's ordinary zoom input.
// A tap snaps to the next framing step. Holding past ZOOM_HOLD_DELAY goes to full speed. A pinch or the slider sets a target that is eased toward.

/** How long a press must be held before it stops being a tap and turns into a continuous zoom. */
export const ZOOM_HOLD_DELAY = 0.15;
/** Time constant of the ease toward a snap or pinch target, in seconds. */
const EASE_SECONDS = 0.035;
const FULL_LOG_RATE = zoomLogRate(127);

/** The next framing step past `zoom` in `direction` (+1 tighter, −1 wider), or the limit when there is none. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  const steps = TUNING.zoomSteps;
  if (direction > 0) return [...steps].reverse().find((step) => step < zoom - 0.5) ?? TUNING.minZoom;
  return steps.find((step) => step > zoom + 0.5) ?? TUNING.maxZoom;
}

/** Proportional input that eases the zoom onto `target` in about 0.15 s with no overshoot. */
export function easeZoomInput(zoom: number, target: number): number {
  const error = Math.log(zoom / target);
  if (Math.abs(zoom - target) < 0.05) return 0;
  // Invert the sim's response curve so the eased log speed is error / EASE_SECONDS, never above full input.
  const wanted = Math.min(FULL_LOG_RATE, Math.abs(error) / EASE_SECONDS);
  let lo = 0; let hi = 127;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (zoomLogRate(mid) < wanted) lo = mid; else hi = mid; }
  return Math.sign(error) * Math.max(1, Math.round(hi));
}

/** Input for a zoom press held `heldSeconds`: snap ease first, then full speed after the hold delay with a short ramp. */
export function heldZoomInput(direction: 1 | -1, heldSeconds: number): number {
  if (heldSeconds < ZOOM_HOLD_DELAY) return 0;
  return direction * Math.min(127, 100 + (heldSeconds - ZOOM_HOLD_DELAY) * 400);
}
