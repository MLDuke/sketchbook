import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutPanels, MAX_PANELS } from "./layout.ts";
import type { LayoutInput } from "./layout.ts";

const base: LayoutInput = {
  width: 800,
  height: 400,
  pitch: 16,
  multiPanel: true,
  cols: 2,
  rows: 2,
  gap: 24,
  lag: 60,
  t: 10,
};

describe("single view", () => {
  const panels = layoutPanels({ ...base, multiPanel: false });

  it("is one full-size panel at scale 1, at time t", () => {
    assert.equal(panels.length, 1);
    const [panel] = panels;
    assert.deepEqual(panel.rect, { x: 0, y: 0, w: 800, h: 400 });
    assert.equal(panel.scale, 1);
    assert.equal(panel.time, 10);
    assert.equal(panel.k, 0);
  });

  it("ignores the panel dials", () => {
    const other = layoutPanels({ ...base, multiPanel: false, cols: 4, rows: 3, gap: 80, lag: 120 });
    assert.deepEqual(other, panels);
  });

  it("centres whole cells in the leftover space", () => {
    // 800 / 16 = 50 cols exactly; 400 / 16 = 25 rows exactly.
    assert.deepEqual(panels[0].grid, { x: 0, y: 0, cols: 50, rows: 25 });
    const odd = layoutPanels({ ...base, multiPanel: false, width: 805, height: 410 })[0];
    assert.deepEqual(odd.grid, { x: 2.5, y: 5, cols: 50, rows: 25 });
  });

  it("keeps at least one cell when the canvas is smaller than the pitch", () => {
    const tiny = layoutPanels({ ...base, multiPanel: false, width: 10, height: 10 })[0];
    assert.equal(tiny.grid.cols, 1);
    assert.equal(tiny.grid.rows, 1);
    assert.equal(tiny.grid.x, 10 / 2 - 16 / 2);
  });
});

describe("2x2 panels", () => {
  const panels = layoutPanels(base);

  it("lists panels in reading order", () => {
    assert.deepEqual(
      panels.map((p) => [p.rect.x, p.rect.y]),
      [
        [0, 0],
        [412, 0],
        [0, 212],
        [412, 212],
      ],
    );
  });

  it("makes the bottom-right panel k = 0, the live one", () => {
    assert.deepEqual(
      panels.map((p) => p.k),
      [3, 2, 1, 0],
    );
    const live = panels[3];
    assert.equal(live.time, 10);
    assert.deepEqual(live.rect, { x: 412, y: 212, w: 388, h: 188 });
  });

  it("shows panel k at t - k * lag / 60", () => {
    assert.deepEqual(
      panels.map((p) => p.time),
      [7, 8, 9, 10],
    );
    // top-left lags by 3 * lag / 60
    assert.equal(panels[0].time, base.t - (3 * base.lag) / 60);
    const slow = layoutPanels({ ...base, lag: 30 });
    assert.equal(slow[0].time, 10 - 1.5);
  });

  it("gives every panel its own cell grid inside its rect", () => {
    // 388 / 16 = 24 cols with 4px spare; 188 / 16 = 11 rows with 12px spare.
    for (const p of panels) {
      assert.equal(p.grid.cols, 24);
      assert.equal(p.grid.rows, 11);
      assert.equal(p.grid.x, p.rect.x + 2);
      assert.equal(p.grid.y, p.rect.y + 6);
    }
  });
});

describe("scale", () => {
  it("crops rather than stretches when the panel aspect differs from the canvas", () => {
    // 3x1 panels on an 800x400 canvas: each is 250.67 x 400, so the height
    // fits exactly and the width gets cropped. Scale is the larger ratio.
    const panels = layoutPanels({ ...base, cols: 3, rows: 1, gap: 24 });
    const pw = (800 - 24 * 2) / 3;
    assert.equal(panels.length, 3);
    for (const p of panels) {
      assert.equal(p.rect.w, pw);
      assert.equal(p.rect.h, 400);
      assert.equal(p.scale, Math.max(pw / 800, 400 / 400));
      assert.equal(p.scale, 1);
    }
  });

  it("uses the width ratio when the panels are wide and short", () => {
    const panels = layoutPanels({ ...base, cols: 1, rows: 4, gap: 0 });
    // 800 x 100 panels: width fits (1), height is a quarter.
    assert.equal(panels[0].scale, Math.max(800 / 800, 100 / 400));
    assert.equal(panels[0].scale, 1);
    const grid = layoutPanels({ ...base, cols: 2, rows: 2, gap: 0 });
    assert.equal(grid[0].scale, 0.5); // 400 x 200 on 800 x 400
  });

  it("is the same for every panel", () => {
    const scales = new Set(layoutPanels({ ...base, cols: 3, rows: 3 }).map((p) => p.scale));
    assert.equal(scales.size, 1);
  });
});

describe("gap and centring", () => {
  it("spaces panels by their width plus the gap", () => {
    const panels = layoutPanels({ ...base, cols: 2, rows: 1, gap: 40 });
    const [a, b] = panels;
    assert.equal(a.rect.w, (800 - 40) / 2);
    assert.equal(b.rect.x - (a.rect.x + a.rect.w), 40);
    assert.equal(a.rect.x, 0);
    assert.equal(b.rect.x + b.rect.w, 800);
  });

  it("fills the canvas edge to edge when panels aren't floored", () => {
    const panels = layoutPanels({ ...base, cols: 4, rows: 2, gap: 10 });
    const last = panels[panels.length - 1];
    assert.ok(Math.abs(last.rect.x + last.rect.w - 800) < 1e-9);
    assert.ok(Math.abs(last.rect.y + last.rect.h - 400) < 1e-9);
  });

  it("centres the block when panels are floored at the pitch", () => {
    // 4 panels would be (100 - 30) / 4 = 17.5 wide, under the 40 pitch, so each
    // floors at 40 and the 190px block overflows the 100px canvas evenly.
    const panels = layoutPanels({ ...base, width: 100, height: 400, pitch: 40, cols: 4, rows: 1, gap: 10 });
    assert.equal(panels[0].rect.w, 40);
    assert.equal(panels[0].rect.x, -45);
    assert.equal(panels[3].rect.x + panels[3].rect.w, 145);
    assert.equal(panels[0].rect.y, 0);
  });

  it("rounds fractional cols and rows from the dials", () => {
    assert.equal(layoutPanels({ ...base, cols: 2.4, rows: 1.6 }).length, 4);
  });
});

describe("panel count", () => {
  it("clamps cols x rows to MAX_PANELS", () => {
    assert.equal(MAX_PANELS, 16);
    const panels = layoutPanels({ ...base, cols: 5, rows: 4 });
    assert.equal(panels.length, MAX_PANELS);
    // The first MAX_PANELS in reading order survive; the last of them is live.
    assert.equal(panels[0].k, MAX_PANELS - 1);
    assert.equal(panels[MAX_PANELS - 1].k, 0);
    assert.equal(panels[MAX_PANELS - 1].time, base.t);
    assert.deepEqual(
      [panels[15].rect.x, panels[15].rect.y],
      [(15 % 5) * (panels[0].rect.w + base.gap), Math.floor(15 / 5) * (panels[0].rect.h + base.gap)],
    );
  });

  it("allows exactly MAX_PANELS", () => {
    assert.equal(layoutPanels({ ...base, cols: 4, rows: 4 }).length, 16);
  });
});

describe("early time", () => {
  it("lets lagging panels go negative while t is small", () => {
    const panels = layoutPanels({ ...base, t: 0.5, lag: 60 });
    assert.deepEqual(
      panels.map((p) => p.time),
      [-2.5, -1.5, -0.5, 0.5],
    );
  });

  it("starts every panel at t = 0 when lag is 0", () => {
    const panels = layoutPanels({ ...base, t: 0, lag: 0 });
    assert.ok(panels.every((p) => p.time === 0));
  });
});
