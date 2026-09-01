#!/usr/bin/env node
// Publish-time gate for entries/. Structural checks run on every entry; the
// stricter content checks only run on publish: true, since drafts are expected
// to be incomplete.
//
// portfolio-site throws at build time on a media item that has a src but no
// alt, so catching that here turns a confusing remote build failure into a
// local one.
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ENTRIES_DIR = "entries";
const TYPES = ["image", "code", "mixed"];

// Deliberately minimal: handles the flat scalars and the single list-of-objects
// (media) that the schema in README.md defines, and nothing else. If the schema
// grows past that, reach for a real YAML parser.
function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    const end = v.indexOf('"', 1);
    return end === -1 ? v.slice(1) : v.slice(1, end).replace(/\\"/g, '"');
  }
  if (v.startsWith("'")) {
    const end = v.indexOf("'", 1);
    return end === -1 ? v.slice(1) : v.slice(1, end);
  }
  const stripped = v.includes(" #") ? v.slice(0, v.indexOf(" #")).trim() : v;
  if (stripped === "true") return true;
  if (stripped === "false") return false;
  if (stripped === "[]") return [];
  return stripped;
}

// Returns { data, problems }, or null if there's no frontmatter block at all.
// Anything inside the block that doesn't fit the schema is reported rather than
// dropped: silently reading a mis-indented media list as "no media" would skip
// exactly the src/alt checks this script exists to run.
function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return null;

  const data = {};
  const problems = [];
  let listKey = null;
  let item = null;

  lines.slice(1, end).forEach((line, i) => {
    // +2 puts this back on 1-based file lines, past the opening "---".
    const where = `line ${i + 2}`;
    if (!line.trim() || line.trim().startsWith("#")) return;

    // Indentation is loose on purpose — YAML lets a sequence sit at or below
    // its parent key's column, and editors disagree about which to emit.
    const listStart = line.match(/^\s*-\s+(\w+):(.*)$/);
    if (listStart) {
      if (!listKey) {
        problems.push(`${where}: list item "- ${listStart[1]}:" does not follow a list key`);
        return;
      }
      item = { [listStart[1]]: parseScalar(listStart[2]) };
      data[listKey].push(item);
      return;
    }

    const listCont = line.match(/^\s+(\w+):(.*)$/);
    if (listCont) {
      if (!item) {
        problems.push(`${where}: indented key "${listCont[1]}" does not belong to a list item`);
        return;
      }
      item[listCont[1]] = parseScalar(listCont[2]);
      return;
    }

    const top = line.match(/^(\w+):(.*)$/);
    if (top) {
      const [, key, rest] = top;
      if (!rest.trim()) {
        data[key] = [];
        listKey = key;
        item = null;
      } else {
        data[key] = parseScalar(rest);
        listKey = null;
        item = null;
      }
      return;
    }

    problems.push(`${where}: could not parse "${line.trim()}"`);
  });

  return { data, problems };
}

function isMeaningfulDir(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir).some((f) => f !== ".gitkeep");
}

async function checkEntry(dirName, errors) {
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
  for (const dir of dirs) await checkEntry(dir, errors);

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
