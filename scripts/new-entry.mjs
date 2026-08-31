#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

const TYPES = ["image", "code", "mixed"];

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

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const title = await prompt(rl, "Entry title: ", {
    validate: (v) => v.length > 0,
    hint: "Title can't be empty.",
  });
  const type = await prompt(rl, `Type (${TYPES.join("/")}): `, {
    validate: (v) => TYPES.includes(v),
    hint: `Please enter one of: ${TYPES.join(", ")}`,
  });

  rl.close();

  const date = todayISO();
  const slug = slugify(title);
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
    `date: "${date}"`,
    `slug: "${slug}"`,
    `type: ${type}`,
    "publish: false",
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
  console.log("  1. Drop media (images/GIFs) into the entry folder.");
  if (needsSource) {
    console.log("  2. Drop the source file(s) into src/ and update sourcePath if needed.");
  }
  console.log("  3. Fill in index.md.");
  console.log("  4. Flip publish: true and push when it's ready to ship.");
}

main();
