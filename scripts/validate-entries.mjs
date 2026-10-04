#!/usr/bin/env node
// Node adapter for the Entry module (scripts/lib/entry.mjs): walks entries/,
// hands each folder to readEntry as plain data, prints what comes back and sets
// the exit code. What counts as a problem is decided in entry.mjs, not here.
//
// Structural checks fail drafts too; content checks only apply to publish: true.
// portfolio-site throws at build time on a media item that has a src but no
// alt, so catching that here turns a confusing remote build failure into a
// local one.
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findSourceFile, readEntry } from "./lib/entry.mjs";

const ENTRIES_DIR = "entries";

// Every file under the entry folder, as entry-relative "/" paths with sizes.
// Per-entry workspaces keep their dependencies in node_modules; not entry content.
function listFiles(root, rel = "") {
  const files = [];
  for (const dirent of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (dirent.name === "node_modules") continue;
    const relPath = rel ? `${rel}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      files.push(...listFiles(root, relPath));
    } else {
      files.push({ path: relPath, size: statSync(path.join(root, relPath)).size });
    }
  }
  return files;
}

/** Reads one folder under `entriesDir` into Entry-module inputs and judges it. */
export async function checkEntryDir(entriesDir, dir) {
  const entryDir = path.join(entriesDir, dir);
  const indexPath = path.join(entryDir, "index.md");
  const files = listFiles(entryDir);
  const sourceFile = findSourceFile(files);
  return readEntry({
    dir,
    indexMd: existsSync(indexPath) ? await readFile(indexPath, "utf8") : null,
    files,
    source: sourceFile ? await readFile(path.join(entryDir, sourceFile), "utf8") : undefined,
  });
}

/** Checks every entry folder; returns the printable problems, each prefixed with its path. */
export async function checkAll(entriesDir = ENTRIES_DIR) {
  const dirs = readdirSync(entriesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const errors = [];
  const warnings = [];
  for (const dir of dirs) {
    const { problems } = await checkEntryDir(entriesDir, dir);
    for (const p of problems) {
      const line = `${path.join(entriesDir, dir, p.file)}: ${p.message}`;
      (p.level === "error" ? errors : warnings).push(line);
    }
  }
  return { dirs, errors, warnings };
}

async function main() {
  if (!existsSync(ENTRIES_DIR)) {
    console.log(`No ${ENTRIES_DIR}/ directory — nothing to validate.`);
    return;
  }

  const { dirs, errors, warnings } = await checkAll();

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

// Only run when invoked as a script, so importing this module has no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}
