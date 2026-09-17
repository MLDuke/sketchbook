#!/usr/bin/env node
// Scaffolds entries/<date>-<slug>/. Prompts when run from a terminal; takes
// --title / --type so it also works in a non-interactive shell, which is how
// agents and Conductor run scripts execute it. Hand-creating an entry folder is
// what this exists to prevent — keep both paths working.
//
//   npm run new
//   npm run new -- --title "Scroll snap experiment" --type image
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { argv, stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import readline from "node:readline/promises";

const TYPES = ["image", "code", "mixed"];
const USAGE = 'usage: npm run new -- --title "Entry title" --type image|code|mixed';

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function prompt(rl, question, { validate, hint } = {}) {
  while (true) {
    const answer = (await rl.question(question)).trim();
    if (!validate || validate(answer)) return answer;
    console.log(`  ${hint}`);
  }
}

// Flags win; anything still missing is prompted for, but only if there's a
// terminal to prompt. Without one, say what's missing instead of hanging on a
// readline that will never be answered.
async function resolveInputs(flags) {
  let title = (flags.title ?? "").trim();
  let type = (flags.type ?? "").trim();

  if (type && !TYPES.includes(type)) {
    throw new Error(`--type must be one of: ${TYPES.join(", ")}\n${USAGE}`);
  }
  if (title && type) return { title, type };

  if (!stdin.isTTY) {
    const missing = [!title && "--title", !type && "--type"].filter(Boolean);
    throw new Error(`non-interactive shell: missing ${missing.join(" and ")}\n${USAGE}`);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    if (!title) {
      title = await prompt(rl, "Entry title: ", {
        validate: (v) => v.length > 0,
        hint: "Title can't be empty.",
      });
    }
    if (!type) {
      type = await prompt(rl, `Type (${TYPES.join("/")}): `, {
        validate: (v) => TYPES.includes(v),
        hint: `Please enter one of: ${TYPES.join(", ")}`,
      });
    }
  } finally {
    rl.close();
  }

  return { title, type };
}

async function main() {
  let flags;
  try {
    ({ values: flags } = parseArgs({
      args: argv.slice(2),
      options: { title: { type: "string" }, type: { type: "string" } },
    }));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  let title;
  let type;
  try {
    ({ title, type } = await resolveInputs(flags));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const date = todayISO();
  const slug = slugify(title);

  if (!slug) {
    console.error(`Title "${title}" has no slug-able characters.`);
    process.exitCode = 1;
    return;
  }

  const dirName = `${date}-${slug}`;
  const entryDir = path.join("entries", dirName);

  if (existsSync(entryDir)) {
    console.error(`Entry already exists: ${entryDir}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(entryDir, { recursive: true });

  const needsSource = type === "code" || type === "mixed";
  if (needsSource) {
    await mkdir(path.join(entryDir, "src"), { recursive: true });
    await writeFile(path.join(entryDir, "src", ".gitkeep"), "");
  }

  const frontmatterLines = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    '# description: 1-2 sentences. Feeds the journal card and the page meta/OG',
    "# tags, so write it for someone who hasn't opened the entry yet.",
    'description: ""',
    `date: "${date}"`,
    `slug: "${slug}"`,
    `type: ${type}`,
    "publish: false",
    "# media: one item per image/GIF. src is relative to this entry folder;",
    "# alt is required once src is set. To fill it in, drop the [] below and",
    "# uncomment the example under it:",
    "media: []",
    '#   - src: "scroll-snap.gif"',
    '#     alt: "Scroll snap prototype moving between image panels"',
  ];

  if (needsSource) {
    frontmatterLines.push(
      'sourcePath: "src/"  # path to the source file(s), relative to this entry folder'
    );
  }

  frontmatterLines.push("---", "", "Write a short note about this exploration here.", "");

  await writeFile(path.join(entryDir, "index.md"), frontmatterLines.join("\n"));

  console.log(`\nCreated ${entryDir}`);
  console.log("Next steps:");
  console.log("  1. Drop media (images/GIFs) into the entry folder and update the media list.");
  if (needsSource) {
    console.log("  2. Add src/index.tsx — it must `export default` a React component.");
  }
  console.log("  3. Fill in index.md.");
  console.log("  4. Flip publish: true and push when it's ready to ship.");
}

main();
