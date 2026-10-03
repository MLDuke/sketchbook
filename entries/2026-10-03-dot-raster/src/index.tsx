import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { useDialKitController } from "dialkit";

// Dot raster: a source makes a scalar field in [0,1] per grid cell, a render
// mode turns that value into a dot radius + colour, and one WebGL2 <canvas>
// draws it.
//
//   source (band | ripple | interference | image) -> field(cell) -> v
//   render (binary | halftone)                    -> v -> radius, colour
//
// The whole pipeline lives in one fragment shader over a full-screen triangle:
// each pixel finds its panel, then its dot cell, evaluates the field at that
// cell's centre and draws an antialiased circle. Cost depends on pixel count,
// not dot count. JS only lays out the panels and uploads uniforms.
//
// Colours are literals rather than the playground's CSS variables so the
// sketch survives being lifted out of this repo. They assume the dark stage.

// Deterministic noise: interference sources are placed from a seed, never
// Math.random, so the first frame is identical on every reload.
function pseudoRandom(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0.5, 0.5, 0.5];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SOURCES = ["band", "ripple", "interference", "image"];
const STAGE_HEIGHT_MIN = 200;
const MAX_PANELS = 16; // 4 x 4, the top of the cols/rows dials

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid #333",
  background: "#1e2027",
  color: "inherit",
  cursor: "pointer",
};

// --- shaders ---------------------------------------------------------------
// Coordinates are CSS pixels from the grid's top-left; a pixel's field
// position is its dot centre's offset from the panel centre, divided by the
// panel's scale, so px-valued dials keep their meaning in every panel. `t` is
// seconds of un-paused time, already offset per panel.

const VERT = `#version 300 es
void main() {
  // One oversized triangle covers the viewport; no buffers needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;

const float TAU = 6.28318530718;
const int MAX_PANELS = ${MAX_PANELS};

uniform float uDpr;         // drawing-buffer px per CSS px
uniform float uBufH;        // drawing-buffer height, to flip gl_FragCoord
uniform vec2 uSize;         // full grid size, CSS px
uniform float uPitch;
uniform float uRIn;
uniform float uRAct;
uniform float uThreshold;
uniform int uBinary;
uniform vec3 uCIn;
uniform vec3 uCAct;
uniform int uSource;        // 0 band, 1 ripple, 2 interference, 3 image

uniform int uPanelCount;
uniform vec4 uRect[MAX_PANELS];  // x, y, w, h in CSS px
uniform vec2 uTS[MAX_PANELS];    // time offset, scale

uniform vec4 uBand;         // wavelength, amplitude, thickness, pitch
uniform vec2 uBandMotion;   // angle (rad), speed
uniform vec3 uRipple;       // wavelength, speed, falloff
uniform vec2 uRippleC;      // centre as a fraction of the grid
uniform int uIntCount;
uniform vec2 uIntSrc[4];    // seeded source positions, px from grid centre
uniform vec2 uInt;          // wavelength, speed

uniform sampler2D uImage;
uniform int uHasImage;
uniform vec2 uImageSize;
uniform vec3 uImageAdj;     // contrast, brightness, invert

out vec4 outColor;

float bandField(vec2 p, float t) {
  float a = uBandMotion.x;
  float along = p.x * cos(a) + p.y * sin(a);
  float across = -p.x * sin(a) + p.y * cos(a);
  float phase = along / uBand.x - t * uBandMotion.y;
  // The wave travels along the band; the whole pattern also drifts across it,
  // so the stripes sweep rather than only wobble.
  float centre = uBand.y * sin(phase * TAU);
  float drift = t * uBandMotion.y * uBand.w * 0.5;
  float dist = abs(mod(across - centre - drift, uBand.w) - uBand.w * 0.5);
  // Swell the band along its length so it tapers like a brush stroke.
  float half_ = uBand.z * 0.5 * (0.82 + 0.18 * sin(along / uBand.x * 2.1 + 1.0));
  return 1.0 - smoothstep(half_ * 0.35, half_, dist);
}

float rippleField(vec2 p, float t) {
  float r = length(p - (uRippleC - 0.5) * uSize);
  float ring = 0.5 + 0.5 * cos((r / uRipple.x - t * uRipple.y) * TAU);
  float fade = exp(-uRipple.z * r / (length(uSize) * 0.5));
  // Smoothstepped ring: thins the rings into bold arcs, not a soft wash.
  return fade * ring * ring * (3.0 - 2.0 * ring);
}

float interferenceField(vec2 p, float t) {
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uIntCount) break;
    sum += cos((length(p - uIntSrc[i]) / uInt.x - t * uInt.y) * TAU);
  }
  float norm = sum / float(uIntCount);
  return clamp(0.5 + 0.5 * clamp(norm * 1.5, -1.0, 1.0), 0.0, 1.0);
}

// The picture is cover-fit into the panel's cols x rows grid. Sample once at
// the cell centre, with the mip level picked from the cell's footprint in
// image pixels so a coarse grid averages instead of aliasing. (textureLod, not
// texture: the UV is constant per cell, so screen derivatives would be wrong.)
float imageField(vec2 cell, vec2 dim) {
  if (uHasImage == 0) return 0.0;
  float scale = max(dim.x / uImageSize.x, dim.y / uImageSize.y);
  vec2 uv = 0.5 + ((cell + 0.5) / dim - 0.5) * dim / (scale * uImageSize);
  vec3 c = textureLod(uImage, uv, log2(max(1.0, 1.0 / scale))).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float v = clamp((lum - 0.5) * uImageAdj.x + 0.5 + uImageAdj.y, 0.0, 1.0);
  return uImageAdj.z > 0.5 ? 1.0 - v : v;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uDpr;

  int hit = -1;
  for (int i = 0; i < MAX_PANELS; i++) {
    if (i >= uPanelCount) break;
    vec4 r = uRect[i];
    if (px.x >= r.x && px.x < r.x + r.z && px.y >= r.y && px.y < r.y + r.w) {
      hit = i;
      break;
    }
  }
  if (hit < 0) { // a gap between panels, or outside the grid
    outColor = vec4(0.0);
    return;
  }

  vec4 rc = uRect[hit];
  float t = uTS[hit].x;
  float s = uTS[hit].y;
  // Same cols/rows/offset maths as a plain grid, so dots land where they always did.
  vec2 dim = max(vec2(1.0), floor(rc.zw / uPitch));
  vec2 g0 = rc.xy + (rc.zw - dim * uPitch) * 0.5;
  vec2 cell = clamp(floor((px - g0) / uPitch), vec2(0.0), dim - 1.0);
  vec2 centre = g0 + (cell + 0.5) * uPitch;
  vec2 f = (centre - (rc.xy + rc.zw * 0.5)) / s;

  float v;
  if (uSource == 1) v = rippleField(f, t);
  else if (uSource == 2) v = interferenceField(f, t);
  else if (uSource == 3) v = imageField(cell, dim);
  else v = bandField(f, t);
  v = clamp(v, 0.0, 1.0);

  bool on = v >= uThreshold;
  float rad = uBinary == 1 ? (on ? uRAct : uRIn) : mix(uRIn, uRAct, v);
  vec3 col = uBinary == 1 ? (on ? uCAct : uCIn) : mix(uCIn, uCAct, v);

  // About one device pixel of antialiasing. Output is premultiplied so the
  // stage shows through everywhere that isn't a dot.
  float a = 1.0 - smoothstep(rad - 0.5 / uDpr, rad + 0.5 / uDpr, length(px - centre));
  outColor = vec4(col * a, a);
}`;

// --- GL plumbing -----------------------------------------------------------

interface GLState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  texture: WebGLTexture | null;
  textureVersion: number; // which loaded image the texture holds; -1 = none
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return "Couldn't create a shader";
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    console.error(`[dot-raster] ${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader failed:\n${log}`);
    gl.deleteShader(shader);
    return "The dot shader failed to compile (see the console)";
  }
  return shader;
}

// Compile and link once per context; uniform locations are looked up here too.
function createState(gl: WebGL2RenderingContext): GLState | string {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  if (typeof vs === "string") return vs;
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (typeof fs === "string") {
    gl.deleteShader(vs);
    return fs;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(`[dot-raster] program failed to link:\n${gl.getProgramInfoLog(program) ?? ""}`);
    gl.deleteProgram(program);
    return "The dot shader failed to link (see the console)";
  }
  const uniforms: GLState["uniforms"] = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, "");
    uniforms[name] = gl.getUniformLocation(program, info.name);
  }
  gl.useProgram(program);
  gl.disable(gl.BLEND);
  return { gl, program, uniforms, texture: null, textureVersion: -1 };
}

// Interference sources, in px from the grid centre. Seeded, so identical on reload.
function interferenceSources(count: number, seed: number, w: number, h: number): Float32Array {
  const out = new Float32Array(8);
  for (let i = 0; i < count; i++) {
    const rx = pseudoRandom(seed * 131 + i * 17.3 + 1);
    const ry = pseudoRandom(seed * 197 + i * 31.7 + 2);
    out[i * 2] = (0.15 + 0.7 * rx - 0.5) * w;
    out[i * 2 + 1] = (0.15 + 0.7 * ry - 0.5) * h;
  }
  return out;
}

export default function DotRaster() {
  // The controller (not plain useDialKit) so loading an image can flip the
  // `source` select from code.
  const { values: p, setValue } = useDialKitController("Dot raster", {
    source: { type: "select", options: SOURCES, default: "band" },
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
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const glRef = useRef<GLState | null>(null);
  const timeRef = useRef(0);
  const dragDepth = useRef(0);
  const panelRects = useRef(new Float32Array(MAX_PANELS * 4));
  const panelTS = useRef(new Float32Array(MAX_PANELS * 2));

  const [width, setWidth] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const height = Math.max(STAGE_HEIGHT_MIN, Math.round(p.grid.height));
  const isImage = p.source === "image";
  const animating = playing && !isImage;

  // Always-current snapshot for the rAF loop, which must not re-subscribe on
  // every dial tick.
  const state = useRef({ p, width, height, imageVersion });
  state.current = { p, width, height, imageVersion };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // GL context: created once, rebuilt if the browser takes it away and gives it
  // back. Declared before the draw effects so the first paint has a program.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      setGlError("WebGL2 isn't available in this browser, so the dot grid can't render.");
      return;
    }
    const init = () => {
      const made = createState(gl);
      if (typeof made === "string") {
        glRef.current = null;
        setGlError(made);
      } else {
        glRef.current = made;
      }
    };
    const onLost = (e: Event) => {
      e.preventDefault(); // opt in to restoration
      glRef.current = null;
    };
    const onRestored = () => {
      init();
      drawRef.current();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    init();
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      const g = glRef.current;
      if (g) {
        g.gl.deleteTexture(g.texture);
        g.gl.deleteProgram(g.program);
      }
      glRef.current = null;
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    const g = glRef.current;
    const { p, width: w, height: h } = state.current;
    if (!canvas || !g || w <= 0 || g.gl.isContextLost()) return;
    const { gl, uniforms: u } = g;

    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    gl.viewport(0, 0, bw, bh);

    const pitch = Math.max(2, p.grid.spacing);
    const t0 = timeRef.current;

    // One panel in single view; a staggered grid of miniatures in multi-panel
    // mode. Panel k (0 = bottom-right) shows the same simulation k*lag frames
    // earlier (a frame is 1/60 s). Sources are analytic in t, so a panel just
    // evaluates the field at its own time; there is no history buffer.
    const rects = panelRects.current;
    const ts = panelTS.current;
    let count = 1;
    if (p.panels.multiPanel) {
      const pc = Math.round(p.panels.cols);
      const pr = Math.round(p.panels.rows);
      const gap = p.panels.gap;
      const pw = Math.max(pitch, (w - gap * (pc - 1)) / pc);
      const ph = Math.max(pitch, (h - gap * (pr - 1)) / pr);
      // Uniform scale so each panel keeps the composition's proportions; if the
      // panel's aspect differs from the canvas it crops the edges, not stretches.
      const s = Math.max(pw / w, ph / h);
      count = Math.min(MAX_PANELS, pc * pr);
      for (let i = 0; i < count; i++) {
        const k = count - 1 - i;
        rects.set(
          [
            (i % pc) * (pw + gap) + (w - (pc * pw + (pc - 1) * gap)) / 2,
            Math.floor(i / pc) * (ph + gap) + (h - (pr * ph + (pr - 1) * gap)) / 2,
            pw,
            ph,
          ],
          i * 4,
        );
        ts.set([t0 - (k * p.panels.lag) / 60, s], i * 2);
      }
    } else {
      rects.set([0, 0, w, h], 0);
      ts.set([t0, 1], 0);
    }

    // Upload a newly loaded image once; the texture then lives on the GPU.
    const bitmap = bitmapRef.current;
    if (bitmap && g.textureVersion !== state.current.imageVersion) {
      if (!g.texture) g.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, g.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      g.textureVersion = state.current.imageVersion;
    }

    const source = Math.max(0, SOURCES.indexOf(p.source));
    const cIn = hexToRgb(p.inactiveColor);
    const cAct = hexToRgb(p.activeColor);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uBufH, bh);
    gl.uniform2f(u.uSize, w, h);
    gl.uniform1f(u.uPitch, pitch);
    gl.uniform1f(u.uRIn, Math.min(p.inactiveRadius, pitch / 2));
    gl.uniform1f(u.uRAct, Math.min(p.activeRadius, pitch / 2));
    gl.uniform1f(u.uThreshold, p.threshold);
    gl.uniform1i(u.uBinary, p.render === "binary" ? 1 : 0);
    gl.uniform3f(u.uCIn, cIn[0], cIn[1], cIn[2]);
    gl.uniform3f(u.uCAct, cAct[0], cAct[1], cAct[2]);
    gl.uniform1i(u.uSource, source);
    gl.uniform1i(u.uPanelCount, count);
    gl.uniform4fv(u.uRect, rects);
    gl.uniform2fv(u.uTS, ts);
    gl.uniform4f(u.uBand, p.band.wavelength, p.band.amplitude, p.band.thickness, p.band.pitch);
    gl.uniform2f(u.uBandMotion, (p.band.angle * Math.PI) / 180, p.band.speed);
    gl.uniform3f(u.uRipple, p.ripple.wavelength, p.ripple.speed, p.ripple.falloff);
    gl.uniform2f(u.uRippleC, p.ripple.centerX, p.ripple.centerY);
    const n = Math.round(p.interference.count);
    gl.uniform1i(u.uIntCount, n);
    gl.uniform2fv(u.uIntSrc, interferenceSources(n, p.interference.seed, w, h));
    gl.uniform2f(u.uInt, p.interference.wavelength, p.interference.speed);
    gl.uniform1i(u.uImage, 0);
    gl.uniform1i(u.uHasImage, bitmap && g.textureVersion >= 0 ? 1 : 0);
    gl.uniform2f(u.uImageSize, bitmap?.width ?? 1, bitmap?.height ?? 1);
    gl.uniform3f(u.uImageAdj, p.image.contrast, p.image.brightness, p.image.invert ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    if (!file.type.startsWith("image/")) {
      setError("That file isn't an image");
      return;
    }
    try {
      // Held in memory only: decoded to a bitmap (premultiplied, so transparent
      // pixels read as black) and uploaded to the GPU, never stored.
      const bitmap = await createImageBitmap(file, { premultiplyAlpha: "premultiply" });
      bitmapRef.current?.close();
      bitmapRef.current = bitmap;
      setImageVersion((v) => v + 1);
      setImageName(file.name);
      setError(null);
      setValue("source", "image");
    } catch {
      setError("Couldn't read that image");
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
