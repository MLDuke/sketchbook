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
import {
  ENTRY_TYPES as TYPES,
  entryDirName,
  isEntryType,
  serializeFrontmatter,
  slugify,
  typeNeedsSource,
} from "./lib/entry.mjs";

const USAGE = 'usage: npm run new -- --title "Entry title" --type image|code|mixed';

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

  if (type && !isEntryType(type)) {
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
        validate: isEntryType,
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

  const dirName = entryDirName(date, slug);
  const entryDir = path.join("entries", dirName);

  if (existsSync(entryDir)) {
    console.error(`Entry already exists: ${entryDir}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(entryDir, { recursive: true });

  const needsSource = typeNeedsSource(type);
  if (needsSource) {
    await mkdir(path.join(entryDir, "src"), { recursive: true });
    await writeFile(path.join(entryDir, "src", ".gitkeep"), "");
  }

  const frontmatter = serializeFrontmatter({
    title,
    date,
    slug,
    type,
    // The scaffold's sourcePath points at the src/ folder it just created.
    sourcePath: needsSource ? "src/" : undefined,
  });

  await writeFile(
    path.join(entryDir, "index.md"),
    `${frontmatter}\nWrite a short note about this exploration here.\n`,
  );

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
