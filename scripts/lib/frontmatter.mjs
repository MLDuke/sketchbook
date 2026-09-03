// Minimal YAML-frontmatter reader for entries/*/index.md. Pure string ops, no
// Node builtins, so it runs unchanged in the browser (the playground imports it
// directly) and in the validate/new scripts.
//
// Deliberately minimal: handles the flat scalars and the single list-of-objects
// (media) that the schema in README.md defines, and nothing else. If the schema
// grows past that, reach for a real YAML parser.

export function parseScalar(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    const end = v.indexOf('"', 1);
    return end === -1 ? v : v.slice(1, end).replace(/\\"/g, '"');
  }
  if (v.startsWith("'")) {
    const end = v.indexOf("'", 1);
    return end === -1 ? v : v.slice(1, end);
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
// exactly the src/alt checks the validator exists to run.
export function parseFrontmatter(text) {
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
