import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { useDialKitController } from "dialkit";
import { createDotRenderer, SOURCES } from "./renderer.ts";
import type { DotRenderer } from "./renderer.ts";

// Dot raster: a source makes a scalar field in [0,1] per grid cell, a render
// mode turns that value into a dot radius + colour, and one WebGL2 <canvas>
// draws it.
//
//   source (band | ripple | interference | image) -> field(cell) -> v
//   render (binary | halftone)                    -> v -> radius, colour
//
// This file is the React shell: dials, buttons, image loading and the frame
// loop. layout.ts works out the panels (pure maths); renderer.ts owns WebGL
// and the shader.
//
// Colours are literals rather than the playground's CSS variables so the
// sketch survives being lifted out of this repo. They assume the dark stage.

const STAGE_HEIGHT_MIN = 200;

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #333",
  background: "#1e2027",
  color: "inherit",
  cursor: "pointer",
};

export default function DotRaster() {
  // The controller (not plain useDialKit) so loading an image can flip the
  // `source` select from code.
  const { values: p, setValue } = useDialKitController("Dot raster", {
    source: { type: "select", options: [...SOURCES], default: "band" },
    render: { type: "select", options: ["binary", "halftone"], default: "binary" },
    threshold: [0.5, 0, 1, 0.01],
    inactiveColor: { type: "color", default: "#566074" },
    activeColor: { type: "color", default: "#3d7cf2" },
    inactiveRadius: [1.6, 0.4, 8, 0.1],
    activeRadius: [6.4, 1, 20, 0.1],
    grid: {
      spacing: [16, 6, 40, 1],
      height: [440, STAGE_HEIGHT_MIN, 800, 10],
    },
    panels: {
      multiPanel: false,
      cols: [2, 1, 4, 1],
      rows: [2, 1, 4, 1],
      gap: [24, 0, 80, 1],
      lag: [60, 0, 120, 1],
    },
    band: {
      wavelength: [900, 120, 1600, 10],
      amplitude: [110, 0, 300, 5],
      thickness: [150, 20, 400, 5],
      angle: [-28, -90, 90, 1],
      speed: [0.08, -1, 1, 0.01],
      pitch: [300, 120, 900, 10],
    },
    ripple: {
      wavelength: [130, 30, 400, 5],
      speed: [0.2, -1, 1, 0.01],
      falloff: [0.5, 0, 3, 0.05],
      centerX: [0.5, 0, 1, 0.01],
      centerY: [0.5, 0, 1, 0.01],
    },
    interference: {
      count: [3, 2, 4, 1],
      wavelength: [150, 40, 500, 5],
      speed: [0.15, -1, 1, 0.01],
      seed: [7, 0, 50, 1],
    },
    image: {
      invert: false,
      contrast: [1.2, 0, 3, 0.05],
      brightness: [0, -0.5, 0.5, 0.01],
    },
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rendererRef = useRef<DotRenderer | null>(null);
  const timeRef = useRef(0);
  const dragDepth = useRef(0);
  const loadToken = useRef(0);

  const [width, setWidth] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [imageName, setImageName] = useState<string | null>(null);
  const [, bumpImage] = useState(0); // re-render after a load so a paused sketch repaints
  const [error, setError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const height = Math.max(STAGE_HEIGHT_MIN, Math.round(p.grid.height));
  const isImage = p.source === "image";
  const animating = playing && !isImage;

  // Always-current snapshot for the rAF loop, which must not re-subscribe on
  // every dial tick.
  const state = useRef({ p, width, height });
  state.current = { p, width, height };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Renderer: created once, and it rebuilds itself if the browser takes the GL
  // context away and gives it back. Declared before the draw effects so the
  // first paint has a program.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createDotRenderer(canvas, {
      onError: setGlError,
      onRestore: () => drawRef.current(),
    });
    rendererRef.current = renderer;
    return () => {
      loadToken.current += 1; // a decode still in flight is now stale
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, []);

  const draw = () => {
    const { p, width: w, height: h } = state.current;
    rendererRef.current?.render({ ...p, width: w, height: h }, timeRef.current);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Animation loop: runs only while playing on a moving source. Time only
  // advances while it runs, so pausing freezes the phase and the first frame
  // is always t = 0.
  useEffect(() => {
    if (!animating) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      timeRef.current += dt;
      drawRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating]);

  // When nothing is animating, repaint on every render (dial change, resize,
  // new image) instead of running a loop.
  useEffect(() => {
    if (!animating) drawRef.current();
  });

  async function loadFile(file: File | undefined) {
    if (!file) return;
    // Latest load wins: a decode that resolves after a newer load started (or
    // after unmount) is dropped, and its bitmap closed.
    const token = ++loadToken.current;
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image");
      return;
    }
    try {
      // Held in memory only: decoded to a bitmap (premultiplied, so transparent
      // pixels read as black) and uploaded to the GPU, never stored.
      const bitmap = await createImageBitmap(file, { premultiplyAlpha: "premultiply" });
      const renderer = rendererRef.current;
      if (token !== loadToken.current || !renderer) {
        bitmap.close();
        return;
      }
      renderer.setImage(bitmap);
      bumpImage((v) => v + 1);
      setImageName(file.name);
      setError(null);
      setValue("source", "image");
    } catch {
      if (token === loadToken.current) setError("Couldn't read that image");
    }
  }

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void loadFile(e.dataTransfer.files[0]);
  };

  const showHint = isImage && !imageName;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "stretch" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => setPlaying((v) => !v)}
          disabled={isImage}
          title={isImage ? "Image source is still" : undefined}
          style={{ ...buttonStyle, opacity: isImage ? 0.5 : 1, cursor: isImage ? "default" : "pointer" }}
        >
          {animating ? "pause" : "play"}
        </button>
        <button onClick={() => fileRef.current?.click()} style={buttonStyle}>
          Choose image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void loadFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {(imageName || error) && (
          <span style={{ fontSize: 12, color: error ? "#e07a7a" : "#8a909e" }}>{error ?? imageName}</span>
        )}
      </div>

      <div
        ref={containerRef}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          position: "relative",
          width: "100%",
          height,
          borderRadius: 8,
          outline: dragging ? "2px dashed #3d7cf2" : "2px dashed transparent",
          outlineOffset: 4,
        }}
      >
        {glError ? (
          <div style={{ fontSize: 13, color: "#e07a7a" }}>{glError}</div>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Dot grid rasterized from the ${p.source} source`}
            style={{ display: "block", width, height }}
          />
        )}
        {showHint && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                background: "#16181dE6",
                border: "1px solid #333",
                fontSize: 13,
                color: "#c4c8d2",
              }}
            >
              Drop an image or choose a file
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
