// The Entry module: everything this repo knows about what an entry is.
//
//   readEntry(input)          read an entry folder's data, and judge it
//   serializeFrontmatter(f)   write frontmatter that readEntry reads back
//
// Pure data in, pure data out. No filesystem, no Node builtins, so it runs
// unchanged in the browser (playground/src/sketches.ts) and in Node
// (scripts/validate-entries.mjs, scripts/new-entry.mjs). Those two files are
// adapters: they gather the inputs from their own world and decide what to do
// with the problems. They hold no schema knowledge of their own.
//
// Types live in entry.d.mts; keep them in sync. The frontmatter parser below is
// deliberately hand-rolled and minimal — flat scalars plus the single
// list-of-objects (media) the schema needs. If the schema outgrows that, swap it
// for a real YAML parser rather than extending the regexes.

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

export const ENTRY_TYPES = ["image", "code", "mixed"];

/** Frontmatter fields every entry needs, drafts included. */
export const REQUIRED_FIELDS = ["title", "date", "slug", "type"];

/**
 * Lowercase only. The playground's media glob is literal and case-sensitive
 * (see playground/src/sketches.ts), so an uppercase extension would be on disk
 * but invisible there; readEntry reports it as an error instead. entry.test.mjs
 * keeps this list and that glob in agreement.
 */
export const MEDIA_EXTENSIONS = ["png", "gif", "jpg", "jpeg", "webp", "avif", "svg"];

/**
 * The sketch is `src/index.<ext>`. When several exist the earlier extension
 * here wins, in both adapters, because both ask findSourceFile.
 */
export const SOURCE_EXTENSIONS = ["tsx", "jsx", "ts", "js"];

export const MEDIA_WARN_BYTES = 2 * 1024 * 1024;
export const MEDIA_ERROR_BYTES = 5 * 1024 * 1024;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA_RE = new RegExp(`\\.(${MEDIA_EXTENSIONS.join("|")})$`);
const MEDIA_ANY_CASE_RE = new RegExp(MEDIA_RE.source, "i");
// `export default fn` or `export { x as default }` — both satisfy the contract.
const DEFAULT_EXPORT_RE = /export\s+default\s|export\s*\{[^}]*\bas\s+default\b/;

export function isEntryType(value) {
  return ENTRY_TYPES.includes(value);
}

/** code and mixed entries have a sketch; image entries are just media. */
export function typeNeedsSource(type) {
  return type === "code" || type === "mixed";
}

export function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The folder name rule: an entry's folder is `${date}-${slug}`. */
export function entryDirName(date, slug) {
  return `${date}-${slug}`;
}

/**
 * Picks the sketch file from an entry's file listing: `src/index.<ext>`, or
 * undefined if there isn't one. The adapters call this to know which file to
 * load or read, so the source-file rule lives in exactly one place.
 */
export function findSourceFile(files) {
  const paths = new Set(files.map((f) => f.path));
  for (const ext of SOURCE_EXTENSIONS) {
    if (paths.has(`src/index.${ext}`)) return `src/index.${ext}`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Frontmatter: parsing (internal)
// ---------------------------------------------------------------------------

const ESCAPES = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" };

// Reads a quoted scalar starting at v[0] and returns its value, or null if the
// closing quote is missing. Double quotes honour backslash escapes; single
// quotes only the doubled-quote escape (''), as in YAML. Anything after the
// closing quote (a trailing "# comment") is ignored.
function readQuoted(v) {
  const quote = v[0];
  let out = "";
  for (let i = 1; i < v.length; i++) {
    const c = v[i];
    if (quote === '"' && c === "\\") {
      const next = v[++i];
      if (next === undefined) return null;
      out += ESCAPES[next] ?? c + next;
    } else if (c === quote) {
      if (quote === "'" && v[i + 1] === "'") {
        out += "'";
        i++;
      } else {
        return out;
      }
    } else {
      out += c;
    }
  }
  return null;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('"') || v.startsWith("'")) return readQuoted(v) ?? v;
  const stripped = v.includes(" #") ? v.slice(0, v.indexOf(" #")).trim() : v;
  if (stripped === "true") return true;
  if (stripped === "false") return false;
  if (stripped === "[]") return [];
  return stripped;
}

// Splits index.md into its frontmatter lines and its body. Handles LF and CRLF.
// `lines` is null when there's no (terminated) frontmatter block.
function splitIndex(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { lines: null, body: lines.join("\n").trim() };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { lines: null, body: "" };
  return { lines: lines.slice(1, end), body: lines.slice(end + 1).join("\n").trim() };
}

// Anything inside the block that doesn't fit the schema is reported rather than
// dropped: silently reading a mis-indented media list as "no media" would skip
// exactly the src/alt checks this module exists to run.
function parseFrontmatterLines(lines) {
  const data = {};
  const problems = [];
  let listKey = null;
  let item = null;

  lines.forEach((line, i) => {
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
      } else {
        data[key] = parseScalar(rest);
        listKey = null;
      }
      item = null;
      return;
    }

    problems.push(`${where}: could not parse "${line.trim()}"`);
  });

  return { data, problems };
}

// ---------------------------------------------------------------------------
// Frontmatter: writing
// ---------------------------------------------------------------------------

const ESCAPE_OUT = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const quote = (s) => `"${String(s).replace(/[\\"\n\r\t]/g, (c) => ESCAPE_OUT[c])}"`;

/**
 * Writes an entry's frontmatter block, `---` fences included, with the
 * explanatory comments the scaffold has always had. Whatever this writes,
 * readEntry reads back. `fields`: title, date, slug, type (required);
 * description, publish, media, sourcePath (optional).
 */
export function serializeFrontmatter(fields) {
  const { title, description = "", date, slug, type, publish = false, media = [], sourcePath } = fields;
  if (!isEntryType(type)) {
    throw new TypeError(`type must be one of: ${ENTRY_TYPES.join(", ")}`);
  }

  const lines = [
    "---",
    `title: ${quote(title)}`,
    "# description: 1-2 sentences. Feeds the journal card and the page meta/OG",
    "# tags, so write it for someone who hasn't opened the entry yet.",
    `description: ${quote(description)}`,
    `date: ${quote(date)}`,
    `slug: ${quote(slug)}`,
    `type: ${type}`,
    `publish: ${publish ? "true" : "false"}`,
    "# media: one item per image/GIF. src is relative to this entry folder;",
  ];

  if (media.length === 0) {
    lines.push(
      "# alt is required once src is set. To fill it in, drop the [] below and",
      "# uncomment the example under it:",
      "media: []",
      '#   - src: "scroll-snap.gif"',
      '#     alt: "Scroll snap prototype moving between image panels"',
    );
  } else {
    lines.push("# alt is required once src is set.", "media:");
    for (const m of media) {
      lines.push(`  - src: ${quote(m.src ?? "")}`);
      if (m.alt) lines.push(`    alt: ${quote(m.alt)}`);
      if (m.caption) lines.push(`    caption: ${quote(m.caption)}`);
    }
  }

  if (sourcePath !== undefined) {
    lines.push(
      `sourcePath: ${quote(sourcePath)}  # path to the source file(s), relative to this entry folder`,
    );
  }

  lines.push("---", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reading and judging
// ---------------------------------------------------------------------------

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Entry-relative path, "./" and doubled or trailing slashes removed.
const normalize = (p) => p.split("/").filter((seg) => seg && seg !== ".").join("/");

// A string field's value, or undefined when it's absent or not a string.
const text = (v) => (typeof v === "string" ? v : undefined);

// Blanks out strings and comments so the default-export check doesn't match
// `export default` inside either. A single pass over one alternation keeps a
// "//" inside a string from being read as a comment. Not a parser: regex
// literals and template-literal interpolations can fool it, which is fine for
// a lint that only has to be right about real sketches.
const STRINGS_AND_COMMENTS_RE =
  /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function stripStringsAndComments(source) {
  return source.replace(STRINGS_AND_COMMENTS_RE, (m) =>
    m.startsWith("/") ? " " : m[0] + m[0],
  );
}

/**
 * Reads one entry and judges it.
 *
 * input:
 *   dir      the folder name, e.g. "2026-09-03-spring-grid"
 *   indexMd  the text of index.md, or null/undefined if the file is missing
 *   files    every file in the entry folder as `{ path, size? }`, paths relative
 *            to it with "/" separators ("index.md", "foo.gif", "src/index.tsx").
 *            `size` is in bytes; files without one skip the weight checks.
 *   source   the text of the file findSourceFile(files) picks; omit to skip the
 *            default-export check
 *   partial  true when `files` is only the subset an adapter can see (the
 *            browser's globs), so a file's absence from it proves nothing.
 *            Skips the "does not exist" checks for media and sourcePath.
 *
 * returns { entry, problems }. `entry` is always populated as far as the data
 * allows: missing or invalid fields read as "", undefined (type, sourcePath,
 * sourceFile) or false (publish), never as a guessed default, and `problems`
 * says why. Each problem is { level: "error" | "warning", code, message, file }.
 *
 * Two tiers of checks. Structural ones run on every entry, drafts included,
 * because they're broken now and cheap to fix now. Content ones run only when
 * `publish: true`, since drafts are expected to be half-finished.
 */
export function readEntry(input) {
  const { dir, indexMd, source, partial = false } = input;
  const files = input.files.map((f) => ({ ...f, path: normalize(f.path) }));
  const problems = [];
  const report = (level, code, message, file = "index.md") =>
    problems.push({ level, code, message, file });
  const error = (code, message, file) => report("error", code, message, file);

  // -- index.md ------------------------------------------------------------
  let data = null;
  let note = "";
  if (typeof indexMd !== "string") {
    error("missing-index", "missing index.md");
  } else {
    const split = splitIndex(indexMd);
    note = split.body;
    if (!split.lines) {
      error("no-frontmatter", "missing or malformed frontmatter block");
    } else {
      const parsed = parseFrontmatterLines(split.lines);
      data = parsed.data;
      for (const message of parsed.problems) error("frontmatter-syntax", message);
    }
  }

  // -- the entry -----------------------------------------------------------
  // Text fields: absent and empty read as "". Present but not text (a bare
  // `title:` parses as a list, `title: true` as a boolean) is its own error.
  const field = (key) => {
    const raw = data?.[key];
    if (raw === undefined) return "";
    if (typeof raw !== "string") {
      error("bad-field", `"${key}" must be a text value`);
      return "";
    }
    return raw;
  };

  const title = field("title");
  const description = field("description");
  const date = field("date");
  const slug = field("slug");
  const rawType = field("type");
  const type = isEntryType(rawType) ? rawType : undefined;
  const sourcePath = field("sourcePath") || undefined;
  const publish = data?.publish === true;

  let media = [];
  if (data?.media !== undefined) {
    if (Array.isArray(data.media)) {
      media = data.media.map((m) => ({
        src: text(m?.src) ?? "",
        alt: text(m?.alt) ?? "",
        caption: text(m?.caption) ?? "",
      }));
    } else {
      error("bad-media", "media must be a list");
    }
  }

  const sourceFile = findSourceFile(files);
  const entry = { dir, title, description, date, slug, type, publish, media, sourcePath, sourceFile, note };

  // -- structural checks: every entry --------------------------------------
  if (data) {
    for (const key of REQUIRED_FIELDS) {
      const raw = data[key];
      if (raw === undefined || (typeof raw === "string" && !raw.trim())) {
        error("missing-field", `missing required field "${key}"`);
      }
    }
    if (rawType.trim() && !type) {
      error("invalid-type", `type "${rawType}" is not one of: ${ENTRY_TYPES.join(", ")}`);
    }
    const dateOk = DATE_RE.test(date);
    if (date && !dateOk) error("invalid-date", `date "${date}" is not YYYY-MM-DD`);
    if (typeof data.publish !== "boolean") error("invalid-publish", "publish must be true or false");

    if (dateOk && slug.trim() && dir !== entryDirName(date, slug)) {
      error(
        "folder-name",
        `folder "${dir}" should be named "${entryDirName(date, slug)}" (date-slug) to match its frontmatter`,
        ".",
      );
    }
  }

  // Repo bloat is a commit-time problem, not a publish-time one, so weight is
  // judged on the files themselves rather than on what frontmatter lists yet.
  for (const { path: file, size } of files) {
    if (file.includes("/") || !MEDIA_ANY_CASE_RE.test(file)) continue;
    if (!MEDIA_RE.test(file)) {
      const lower = file.replace(/\.[^.]+$/, (ext) => ext.toLowerCase());
      error(
        "media-uppercase-extension",
        `uppercase extension — rename it to lowercase (e.g. "${lower}"); the playground only loads lowercase media extensions`,
        file,
      );
    }
    if (typeof size !== "number") continue;
    if (size > MEDIA_ERROR_BYTES) {
      error("media-too-heavy", `${mb(size)} exceeds the ${mb(MEDIA_ERROR_BYTES)} limit — compress it or drop the frame rate`, file);
    } else if (size > MEDIA_WARN_BYTES) {
      report("warning", "media-heavy", `${mb(size)} is heavy for a sketch — consider compressing`, file);
    }
  }

  // The sketch contract, on drafts too: a sketch the playground can find but
  // not render is broken now. Its absence is fine until publish — `npm run new`
  // scaffolds src/ before there's a sketch.
  if (sourceFile && typeof source === "string" && !DEFAULT_EXPORT_RE.test(stripStringsAndComments(source))) {
    error("no-default-export", "no default export — the playground renders `export default` and nothing else", sourceFile);
  }

  // -- content checks: publish: true only ----------------------------------
  if (!publish) return { entry, problems };

  // portfolio-site uses this for the journal card and the page meta/OG tags.
  if (!description.trim()) error("no-description", "published entry has no description");

  // media: [] is what the scaffold writes, so a published image/mixed entry
  // with nothing listed is the likely half-filled state, not a rare one — it
  // would ship a journal card with a blank figure.
  if (media.length === 0 && (type === "image" || type === "mixed")) {
    error("no-media", `published type "${type}" entry has no media`);
  }
  const present = new Set(files.map((f) => f.path));
  media.forEach((m, i) => {
    const label = `media[${i}]`;
    if (!m.src) {
      error("media-no-src", `${label} has no src — it would render as an empty placeholder`);
      return;
    }
    // portfolio-site throws at build time on a src without alt, so catch it
    // here where the message makes sense.
    if (!m.alt.trim()) {
      error("media-no-alt", `${label} ("${m.src}") has no alt text — this fails the portfolio build`);
    }
    if (!partial && !present.has(normalize(m.src))) {
      error("media-missing", `${label} src "${m.src}" does not exist in the entry folder`);
    }
  });

  if (typeNeedsSource(type)) {
    if (!sourceFile) error("no-source-file", `published type "${type}" entry has no src/index.tsx to render`);
    if (!sourcePath) {
      error("no-source-path", `type "${type}" requires a sourcePath`);
    } else if (!partial) {
      const p = normalize(sourcePath);
      const prefix = p ? `${p}/` : "";
      const isFile = present.has(p);
      const inside = files.filter((f) => f.path.startsWith(prefix));
      if (!isFile && inside.length === 0) {
        error("source-path-missing", `sourcePath "${sourcePath}" does not exist`);
      } else if (!isFile && inside.every((f) => f.path.endsWith(".gitkeep"))) {
        error("source-path-empty", `sourcePath "${sourcePath}" is an empty directory`);
      }
    }
  }

  return { entry, problems };
}
