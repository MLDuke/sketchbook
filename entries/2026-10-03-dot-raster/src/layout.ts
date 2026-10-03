// Panel layout for the dot grid: pure maths, no GL and no DOM, so it can be
// tested under node:test. The renderer packs the result into uniforms.
//
// Units are CSS pixels from the canvas's top-left; time is seconds.

export const MAX_PANELS = 16; // 4 x 4, the top of the cols/rows dials

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The dot cells inside a panel: how many, and where the first one starts.
export interface CellGrid {
  x: number; // left edge of the first cell
  y: number; // top edge of the first cell
  cols: number;
  rows: number;
}

export interface Panel {
  k: number; // 0 is the live panel (bottom-right); k lags k * lag frames behind
  rect: Rect;
  time: number; // seconds of un-paused time this panel shows
  scale: number; // panel px per canvas px: 1 in single view, the shrink factor in a panel
  grid: CellGrid;
}

export interface LayoutInput {
  width: number;
  height: number;
  pitch: number; // dot spacing
  multiPanel: boolean;
  cols: number;
  rows: number;
  gap: number;
  lag: number; // frames between neighbouring panels; a frame is 1/60 s
  t: number; // the live panel's time
}

// The one place cell counts and the centring offset are worked out. The shader
// is handed the result and only does the per-pixel part, floor((px - origin) /
// pitch), so a dot lands where it always did; keep that step on this pitch and
// origin. Centring splits the leftover space evenly, so cells hug no edge.
function cellGrid(rect: Rect, pitch: number): CellGrid {
  const cols = Math.max(1, Math.floor(rect.w / pitch));
  const rows = Math.max(1, Math.floor(rect.h / pitch));
  return {
    x: rect.x + (rect.w - cols * pitch) / 2,
    y: rect.y + (rect.h - rows * pitch) / 2,
    cols,
    rows,
  };
}

// One panel in single view; a staggered grid of miniatures in multi-panel
// mode. Panel k shows the same simulation k*lag frames earlier. Sources are
// analytic in t, so a panel just evaluates the field at its own time; there is
// no history buffer. Panels come in reading order, so the last is k = 0.
export function layoutPanels(input: LayoutInput): Panel[] {
  const { width: w, height: h, pitch, gap, lag, t } = input;
  if (!input.multiPanel) {
    const rect = { x: 0, y: 0, w, h };
    return [{ k: 0, rect, time: t, scale: 1, grid: cellGrid(rect, pitch) }];
  }

  const pc = Math.max(1, Math.round(input.cols));
  const pr = Math.max(1, Math.round(input.rows));
  const pw = Math.max(pitch, (w - gap * (pc - 1)) / pc);
  const ph = Math.max(pitch, (h - gap * (pr - 1)) / pr);
  // Uniform scale so each panel keeps the composition's proportions; if the
  // panel's aspect differs from the canvas it crops the edges, not stretches.
  const scale = Math.max(pw / w, ph / h);
  // The block of panels is centred; it only has slack when pw hit its pitch floor.
  const offX = (w - (pc * pw + (pc - 1) * gap)) / 2;
  const offY = (h - (pr * ph + (pr - 1) * gap)) / 2;

  const count = Math.min(MAX_PANELS, pc * pr);
  const panels: Panel[] = [];
  for (let i = 0; i < count; i++) {
    const k = count - 1 - i;
    const rect = {
      x: (i % pc) * (pw + gap) + offX,
      y: Math.floor(i / pc) * (ph + gap) + offY,
      w: pw,
      h: ph,
    };
    panels.push({ k, rect, time: t - (k * lag) / 60, scale, grid: cellGrid(rect, pitch) });
  }
  return panels;
}
