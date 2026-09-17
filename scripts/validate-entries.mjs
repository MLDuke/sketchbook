#!/usr/bin/env node
// Publish-time gate for entries/. Structural checks run on every entry; the
// stricter content checks only run on publish: true, since drafts are expected
// to be incomplete.
//
// "Structural" means anything that is broken regardless of publish state — a
// sketch the playground can't render, or a file heavy enough to bloat the repo.
// Those fail on drafts too, because that is when they're cheap to fix.
//
// portfolio-site throws at build time on a media item that has a src but no
// alt, so catching that here turns a confusing remote build failure into a
// local one.
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const ENTRIES_DIR = "entries";
const TYPES = ["image", "code", "mixed"];

// The playground looks for exactly this file; see playground/src/sketches.ts.
const SOURCE_ENTRY_RE = /^index\.(tsx|jsx|ts|js)$/;
// `export default fn` or `export { x as default }` — both satisfy the contract.
const DEFAULT_EXPORT_RE = /export\s+default\s|export\s*\{[^}]*\bas\s+default\b/;

const MEDIA_RE = /\.(png|gif|jpg|jpeg|webp|avif|svg)$/i;
const MEDIA_WARN_BYTES = 2 * 1024 * 1024;
const MEDIA_ERROR_BYTES = 5 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function isMeaningfulDir(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir).some((f) => f !== ".gitkeep");
}

function sourceEntryPath(entryDir) {
  const srcDir = path.join(entryDir, "src");
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) return null;
  const match = readdirSync(srcDir).find((f) => SOURCE_ENTRY_RE.test(f));
  return match ? path.join(srcDir, match) : null;
}

// Repo bloat is a commit-time problem, not a publish-time one, so this walks
// what's actually on disk rather than what frontmatter happens to list yet.
function checkMediaWeight(entryDir, errors, warnings) {
  for (const file of readdirSync(entryDir)) {
    if (!MEDIA_RE.test(file)) continue;
    const full = path.join(entryDir, file);
    const { size } = statSync(full);
    if (size > MEDIA_ERROR_BYTES) {
      errors.push(`${full}: ${mb(size)} exceeds the ${mb(MEDIA_ERROR_BYTES)} limit — compress it or drop the frame rate`);
    } else if (size > MEDIA_WARN_BYTES) {
      warnings.push(`${full}: ${mb(size)} is heavy for a sketch — consider compressing`);
    }
  }
}

async function checkEntry(dirName, errors, warnings) {
  const entryDir = path.join(ENTRIES_DIR, dirName);
  const indexPath = path.join(entryDir, "index.md");
  const at = (msg) => errors.push(`${indexPath}: ${msg}`);

  if (!existsSync(indexPath)) {
    errors.push(`${entryDir}: missing index.md`);
    return;
  }

  const parsed = parseFrontmatter(await readFile(indexPath, "utf8"));
  if (!parsed) {
    at("missing or malformed frontmatter block");
    return;
  }

  const { data, problems } = parsed;
  for (const problem of problems) at(problem);

  for (const key of ["title", "date", "slug", "type"]) {
    if (!data[key]) at(`missing required field "${key}"`);
  }
  if (data.type && !TYPES.includes(data.type)) {
    at(`type "${data.type}" is not one of: ${TYPES.join(", ")}`);
  }
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    at(`date "${data.date}" is not YYYY-MM-DD`);
  }
  if (typeof data.publish !== "boolean") {
    at('publish must be true or false');
  }
  if (data.media !== undefined && !Array.isArray(data.media)) {
    at("media must be a list");
  }

  checkMediaWeight(entryDir, errors, warnings);

  // The sketch contract, checked on drafts too: an index the playground can
  // find but can't render is broken now, not at publish time. Its *absence* is
  // fine until publish — `npm run new` scaffolds src/ before there's a sketch.
  const sourceEntry = sourceEntryPath(entryDir);
  if (sourceEntry) {
    const source = await readFile(sourceEntry, "utf8");
    if (!DEFAULT_EXPORT_RE.test(source)) {
      errors.push(`${sourceEntry}: no default export — the playground renders \`export default\` and nothing else`);
    }
  }

  // Drafts are allowed to be incomplete — everything below is publish-only.
  if (data.publish !== true) return;

  // portfolio-site uses this for the journal card and the page meta/OG tags,
  // so a published entry can't ship without it.
  if (!String(data.description || "").trim()) {
    at("published entry has no description");
  }

  const media = Array.isArray(data.media) ? data.media : [];
  // media: [] is what the scaffold writes, so a published image/mixed entry
  // with nothing in the list is the likely half-filled state, not a rare one —
  // it would ship a journal card with a blank figure.
  if (media.length === 0 && (data.type === "image" || data.type === "mixed")) {
    at(`published type "${data.type}" entry has no media`);
  }
  media.forEach((m, i) => {
    const label = `media[${i}]`;
    if (!m.src) {
      at(`${label} has no src — it would render as an empty placeholder`);
      return;
    }
    if (!String(m.alt || "").trim()) {
      at(`${label} ("${m.src}") has no alt text — this fails the portfolio build`);
    }
    if (!existsSync(path.join(entryDir, m.src))) {
      at(`${label} src "${m.src}" does not exist in the entry folder`);
    }
  });

  if (data.type === "code" || data.type === "mixed") {
    if (!sourceEntry) {
      at(`published type "${data.type}" entry has no src/index.tsx to render`);
    }
    if (!data.sourcePath) {
      at(`type "${data.type}" requires a sourcePath`);
    } else {
      const resolved = path.join(entryDir, data.sourcePath);
      if (!existsSync(resolved)) {
        at(`sourcePath "${data.sourcePath}" does not exist`);
      } else if (statSync(resolved).isDirectory() && !isMeaningfulDir(resolved)) {
        at(`sourcePath "${data.sourcePath}" is an empty directory`);
      }
    }
  }
}

async function main() {
  if (!existsSync(ENTRIES_DIR)) {
    console.log(`No ${ENTRIES_DIR}/ directory — nothing to validate.`);
    return;
  }

  const dirs = readdirSync(ENTRIES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const errors = [];
  const warnings = [];
  for (const dir of dirs) await checkEntry(dir, errors, warnings);

  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):\n`);
    for (const w of warnings) console.warn(`  ${w}`);
    console.warn("");
  }

  if (errors.length > 0) {
    console.error(`Found ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ${e}`);
    console.error("");
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${dirs.length} entr${dirs.length === 1 ? "y" : "ies"} — all good.`);
}

main();
