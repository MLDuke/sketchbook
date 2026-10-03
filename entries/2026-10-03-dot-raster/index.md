---
title: "Dot raster"
# description: 1-2 sentences. Feeds the journal card and the page meta/OG
# tags, so write it for someone who hasn't opened the entry yet.
description: "A dense grid of dots rasterizing a scalar field: swooping bands, ripples, wave interference, or a dropped-in image. Active dots swell and turn blue, either by threshold or continuously like a halftone."
date: "2026-10-03"
slug: "dot-raster"
type: code
publish: false
# media: one item per image/GIF. src is relative to this entry folder;
# alt is required once src is set. To fill it in, drop the [] below and
# uncomment the example under it:
media: []
#   - src: "scroll-snap.gif"
#     alt: "Scroll snap prototype moving between image panels"
sourcePath: "src/"  # path to the source file(s), relative to this entry folder
---

Inspired by a 1970s Japanese book cover: a flat field of small grey dots where
the "on" ones grow and go blue, forming big diagonal swooshes.

Each frame, a source (`band`, `ripple`, `interference`, or a loaded `image`)
fills one value in [0,1] per grid cell, and a render mode turns that value into a
dot. `binary` is the cover look, with a threshold between small grey and large
blue. `halftone` blends radius and colour continuously. The whole pipeline runs in one WebGL2
fragment shader: each pixel finds its dot cell and draws an antialiased circle, so
the cost doesn't grow with the number of dots.

Drop an image on the grid, or use "Choose image". It is read into memory and
sampled one pixel per cell, and nothing is saved. The image source is static, and
the animation starts paused if the system asks for reduced motion.

Turn on `multiPanel` to split the canvas into a grid of miniature copies of the
whole composition. Each panel runs the same simulation but lags the one after it
by `lag` frames (1/60 s each), with the bottom-right panel live. Together they
read as a staggered sequence. Sources are analytic in time, so a panel just
evaluates the field at an earlier time and no frame history is kept.
