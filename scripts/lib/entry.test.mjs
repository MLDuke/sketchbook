// Tests for the Entry module, through its interface only: readEntry's inputs
// and results, and serializeFrontmatter. Run with `node --test scripts/`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  ENTRY_TYPES,
  MEDIA_ERROR_BYTES,
  MEDIA_EXTENSIONS,
  MEDIA_WARN_BYTES,
  SOURCE_EXTENSIONS,
  entryDirName,
  findSourceFile,
  isEntryType,
  readEntry,
  serializeFrontmatter,
  slugify,
  typeNeedsSource,
} from "./entry.mjs";

// -- fixtures ----------------------------------------------------------------

const DIR = "2026-09-03-spring-grid";
const GOOD_SOURCE = "export default function Sketch() {\n  return null;\n}\n";
const CODE_FILES = ["index.md", "src/index.tsx"];

// index.md text from raw `key: value` pairs; a value of undefined omits the key.
// Values are written as they'd appear in the file, quotes and all, so tests can
// feed the parser hand-written (and malformed) frontmatter.
function indexMd(over = {}, { eol = "\n", body = "Body text.\n" } = {}) {
  const fields = {
    title: '"Spring grid"',
    description: '""',
    date: '"2026-09-03"',
    slug: '"spring-grid"',
    type: "code",
    publish: "false",
    media: "[]",
    sourcePath: '"src/"',
    ...over,
  };
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`);
  return ["---", ...lines, "---", "", body].join(eol);
}

const MEDIA_LIST = '\n  - src: "spring.gif"\n    alt: "A grid of squares settling"';

const asFiles = (files) => files.map((f) => (typeof f === "string" ? { path: f } : f));

// readEntry with a valid draft code entry as the default; override any input.
function read(input = {}) {
  const { files = CODE_FILES, ...rest } = input;
  return readEntry({
    dir: DIR,
    indexMd: indexMd(),
    source: GOOD_SOURCE,
    ...rest,
    files: asFiles(files),
  });
}

// "level:code" for each problem, so a table row can assert exactly what fired.
const summarize = (problems) => problems.map((p) => `${p.level}:${p.code}`).sort();

// -- the happy path ----------------------------------------------------------

describe("a valid entry", () => {
  test("reads into a typed entry with no problems", () => {
    const { entry, problems } = read();
    assert.deepEqual(problems, []);
    assert.deepEqual(entry, {
      dir: DIR,
      title: "Spring grid",
      description: "",
      date: "2026-09-03",
      slug: "spring-grid",
      type: "code",
      publish: false,
      media: [],
      sourcePath: "src/",
      sourceFile: "src/index.tsx",
      note: "Body text.",
    });
  });

  test("reads media items, with absent alt and caption as empty strings", () => {
    const { entry, problems } = read({
      indexMd: indexMd({ media: `${MEDIA_LIST}\n  - src: "b.png"` }),
      files: [...CODE_FILES, "spring.gif", "b.png"],
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(entry.media, [
      { src: "spring.gif", alt: "A grid of squares settling", caption: "" },
      { src: "b.png", alt: "", caption: "" },
    ]);
  });

  test("an image entry needs no sourcePath and has no sourceFile", () => {
    const { entry, problems } = read({
      indexMd: indexMd({ type: "image", sourcePath: undefined }),
      files: ["index.md"],
      source: undefined,
    });
    assert.deepEqual(problems, []);
    assert.equal(entry.sourcePath, undefined);
    assert.equal(entry.sourceFile, undefined);
  });
});

// -- structural checks: every entry, drafts included ------------------------

describe("structural checks", () => {
  const cases = [
    ["missing index.md", { indexMd: null }, ["error:missing-index"]],
    ["no frontmatter block", { indexMd: "just a note\n" }, ["error:no-frontmatter"]],
    ["unterminated frontmatter", { indexMd: "---\ntitle: x\n" }, ["error:no-frontmatter"]],
    ["missing title", { indexMd: indexMd({ title: undefined }) }, ["error:missing-field"]],
    ["missing date", { indexMd: indexMd({ date: undefined }) }, ["error:missing-field"]],
    ["missing slug", { indexMd: indexMd({ slug: undefined }) }, ["error:missing-field"]],
    ["missing type", { indexMd: indexMd({ type: undefined }) }, ["error:missing-field"]],
    ["empty title", { indexMd: indexMd({ title: '""' }) }, ["error:missing-field"]],
    ["blank type", { indexMd: indexMd({ type: '"  "' }) }, ["error:missing-field"]],
    ["title that isn't text", { indexMd: indexMd({ title: "true" }) }, ["error:bad-field"]],
    ["bare `title:` (parses as a list)", { indexMd: indexMd({ title: "" }) }, ["error:bad-field"]],
    ["unknown type", { indexMd: indexMd({ type: "video" }) }, ["error:invalid-type"]],
    ["date not YYYY-MM-DD", { indexMd: indexMd({ date: '"2026/09/03"' }) }, ["error:invalid-date"]],
    ["publish missing", { indexMd: indexMd({ publish: undefined }) }, ["error:invalid-publish"]],
    ["publish not a boolean", { indexMd: indexMd({ publish: "yes" }) }, ["error:invalid-publish"]],
    ["media not a list", { indexMd: indexMd({ media: '"a.gif"' }) }, ["error:bad-media"]],
    [
      "mis-indented list item",
      { indexMd: indexMd({ title: '"Spring grid"\n  - src: "x.gif"' }) },
      ["error:frontmatter-syntax"],
    ],
    ["unparseable line", { indexMd: indexMd({ sourcePath: '"src/"\n!!!' }) }, ["error:frontmatter-syntax"]],
    ["sketch without a default export", { source: "export const a = 1;\n" }, ["error:no-default-export"]],
  ];

  for (const [name, input, expected] of cases) {
    test(name, () => {
      assert.deepEqual(summarize(read(input).problems), expected);
    });
  }

  test("a problem names the file it's about", () => {
    const { problems } = read({ source: "nothing here" });
    assert.equal(problems[0].file, "src/index.tsx");
    assert.equal(read({ indexMd: indexMd({ type: "video" }) }).problems[0].file, "index.md");
  });

  test("an invalid entry reads as empty fields, not guessed defaults", () => {
    const { entry } = read({
      indexMd: indexMd({ title: undefined, type: "video", publish: "yes" }),
    });
    assert.equal(entry.title, "");
    assert.equal(entry.type, undefined);
    assert.equal(entry.publish, false);
  });

  test("a missing index.md still gets its files judged", () => {
    const { problems } = read({
      indexMd: null,
      files: ["FOO.PNG"],
      source: undefined,
    });
    assert.deepEqual(summarize(problems), ["error:media-uppercase-extension", "error:missing-index"]);
  });

  test("drafts skip every content check", () => {
    // Empty description, no media on an image entry, no source at all.
    const image = read({ indexMd: indexMd({ type: "image", sourcePath: undefined }), files: ["index.md"], source: undefined });
    const code = read({ files: ["index.md", "src/.gitkeep"], source: undefined });
    assert.deepEqual(image.problems, []);
    assert.deepEqual(code.problems, []);
  });
});

describe("folder name", () => {
  const cases = [
    ["matches date-slug", DIR, []],
    ["wrong date", "2026-09-04-spring-grid", ["error:folder-name"]],
    ["wrong slug", "2026-09-03-springs", ["error:folder-name"]],
    ["no date prefix", "spring-grid", ["error:folder-name"]],
  ];
  for (const [name, dir, expected] of cases) {
    test(name, () => {
      assert.deepEqual(summarize(read({ dir }).problems), expected);
    });
  }

  test("the message says what the folder should be called", () => {
    const [problem] = read({ dir: "oops" }).problems;
    assert.match(problem.message, /2026-09-03-spring-grid/);
    assert.equal(problem.file, ".");
  });

  test("applies to drafts and published entries alike", () => {
    const published = indexMd({ publish: "true", description: '"d"' });
    assert.deepEqual(summarize(read({ dir: "oops", indexMd: published }).problems), ["error:folder-name"]);
  });

  test("a malformed date is reported once, not again as a folder mismatch", () => {
    const { problems } = read({ dir: "x", indexMd: indexMd({ date: '"nope"' }) });
    assert.deepEqual(summarize(problems), ["error:invalid-date"]);
  });

  test("entryDirName builds the rule", () => {
    assert.equal(entryDirName("2026-09-03", "spring-grid"), DIR);
  });
});

// -- media weight and extensions --------------------------------------------

describe("media weight", () => {
  const cases = [
    ["under the warn threshold", MEDIA_WARN_BYTES - 1, []],
    ["exactly the warn threshold", MEDIA_WARN_BYTES, []],
    ["just over the warn threshold", MEDIA_WARN_BYTES + 1, ["warning:media-heavy"]],
    ["exactly the error threshold", MEDIA_ERROR_BYTES, ["warning:media-heavy"]],
    ["just over the error threshold", MEDIA_ERROR_BYTES + 1, ["error:media-too-heavy"]],
  ];
  for (const [name, size, expected] of cases) {
    test(name, () => {
      const files = [...CODE_FILES, { path: "big.gif", size }];
      assert.deepEqual(summarize(read({ files }).problems), expected);
    });
  }

  test("points at the heavy file, with sizes in the message", () => {
    const files = [...CODE_FILES, { path: "big.gif", size: 6 * 1024 * 1024 }];
    const [problem] = read({ files }).problems;
    assert.equal(problem.file, "big.gif");
    assert.match(problem.message, /6\.0 MB.*5\.0 MB/);
  });

  test("files without a size, non-media files and nested files are not weighed", () => {
    const huge = 100 * 1024 * 1024;
    const files = [
      ...CODE_FILES,
      "unsized.gif",
      { path: "clip.mp4", size: huge },
      { path: "src/nested.png", size: huge },
    ];
    assert.deepEqual(read({ files }).problems, []);
  });

  test("every media extension is weighed", () => {
    for (const ext of MEDIA_EXTENSIONS) {
      const files = [...CODE_FILES, { path: `a.${ext}`, size: MEDIA_ERROR_BYTES + 1 }];
      assert.deepEqual(summarize(read({ files }).problems), ["error:media-too-heavy"], ext);
    }
  });
});

describe("uppercase media extensions", () => {
  for (const name of ["FOO.PNG", "foo.Gif", "shot.JPEG"]) {
    test(`${name} is an error telling the author to rename it`, () => {
      const { problems } = read({ files: [...CODE_FILES, name] });
      assert.deepEqual(summarize(problems), ["error:media-uppercase-extension"]);
      assert.equal(problems[0].file, name);
      assert.match(problems[0].message, /rename it to lowercase/);
      assert.ok(problems[0].message.includes(`"${name.replace(/\.[^.]+$/, (e) => e.toLowerCase())}"`), problems[0].message);
    });
  }

  test("an uppercase file name with a lowercase extension is fine", () => {
    assert.deepEqual(read({ files: [...CODE_FILES, "Foo.png"] }).problems, []);
  });

  test("uppercase non-media files are ignored", () => {
    assert.deepEqual(read({ files: [...CODE_FILES, "NOTES.TXT", "src/Big.PNG"] }).problems, []);
  });

  test("is checked on drafts and on published entries", () => {
    const published = indexMd({ publish: "true", description: '"d"' });
    const { problems } = read({ indexMd: published, files: [...CODE_FILES, "FOO.PNG"] });
    assert.deepEqual(summarize(problems), ["error:media-uppercase-extension"]);
  });
});

// -- the default-export check -----------------------------------------------

describe("default export check", () => {
  const cases = [
    ["export default function", "export default function Sketch() {}", true],
    ["export default arrow", "export default () => null;", true],
    ["export default class", "export default class Sketch {}", true],
    ["export { x as default }", "const A = () => null;\nexport { A as default };", true],
    ["no default export", "export const a = 1;", false],
    ["only in a line comment", "// export default function Sketch() {}\nconst a = 1;", false],
    ["only in a block comment", "/* export default function Sketch() {} */\nconst a = 1;", false],
    ["only in a multi-line block comment", "/**\n * export default function Sketch() {}\n */\nconst a = 1;", false],
    ["only in a string", 'const s = "export default function";', false],
    ["only in a template literal", "const s = `\nexport default function\n`;", false],
    ["real export after a comment with an apostrophe", "// don't\nexport default function Sketch() {}", true],
    ["real export after a URL string", 'const u = "http://example.com";\nexport default function Sketch() {}', true],
    ["real export after JSX text with an apostrophe", "const a = <p>don't</p>;\nexport default a;", true],
    ["commented-out and real", "// export default old\nexport default function Sketch() {}", true],
  ];
  for (const [name, source, ok] of cases) {
    test(name, () => {
      const codes = summarize(read({ source }).problems);
      assert.deepEqual(codes, ok ? [] : ["error:no-default-export"]);
    });
  }

  test("is skipped when no source text is given", () => {
    assert.deepEqual(read({ source: undefined }).problems, []);
  });

  test("is skipped when the entry has no sketch file", () => {
    assert.deepEqual(read({ files: ["index.md"], source: "nothing" }).problems, []);
  });
});

describe("source file rule", () => {
  test("finds src/index.<ext> for each extension", () => {
    for (const ext of SOURCE_EXTENSIONS) {
      assert.equal(findSourceFile([{ path: "index.md" }, { path: `src/index.${ext}` }]), `src/index.${ext}`);
    }
  });

  const none = [
    ["no src folder", [{ path: "index.md" }]],
    ["only a .gitkeep", [{ path: "src/.gitkeep" }]],
    ["a differently named file", [{ path: "src/other.tsx" }]],
    ["index outside src/", [{ path: "index.tsx" }]],
    ["an unsupported extension", [{ path: "src/index.mjs" }]],
  ];
  for (const [name, files] of none) {
    test(`none: ${name}`, () => assert.equal(findSourceFile(files), undefined));
  }

  test("prefers tsx, then jsx, ts, js when several exist", () => {
    const all = SOURCE_EXTENSIONS.map((e) => ({ path: `src/index.${e}` }));
    assert.equal(findSourceFile(all), "src/index.tsx");
    assert.equal(findSourceFile([...all].reverse()), "src/index.tsx");
    assert.equal(findSourceFile(all.slice(1)), "src/index.jsx");
  });

  test("the entry reports the file the module picked", () => {
    const files = ["index.md", "src/index.js", "src/index.ts"];
    assert.equal(read({ files }).entry.sourceFile, "src/index.ts");
  });
});

// -- content checks: publish: true only -------------------------------------

describe("content checks (publish: true)", () => {
  // Each row starts from a complete published entry, then breaks one thing.
  const published = { publish: "true", description: '"A real description."' };
  const publishedImage = {
    ...published,
    type: "image",
    sourcePath: undefined,
    media: MEDIA_LIST,
  };
  const IMAGE_FILES = ["index.md", "spring.gif"];

  const cases = [
    ["description empty", { over: { description: '""' } }, ["error:no-description"]],
    ["description blank", { over: { description: '"   "' } }, ["error:no-description"]],
    [
      "image entry with no media",
      { over: { ...publishedImage, media: "[]" }, files: IMAGE_FILES },
      ["error:no-media"],
    ],
    [
      "mixed entry with no media",
      { over: { type: "mixed", media: "[]" } },
      ["error:no-media"],
    ],
    [
      "media item without src",
      { over: { ...publishedImage, media: '\n  - alt: "orphan"' }, files: IMAGE_FILES },
      ["error:media-no-src"],
    ],
    [
      "media item without alt",
      { over: { ...publishedImage, media: '\n  - src: "spring.gif"' }, files: IMAGE_FILES },
      ["error:media-no-alt"],
    ],
    [
      "media item with blank alt",
      { over: { ...publishedImage, media: '\n  - src: "spring.gif"\n    alt: "  "' }, files: IMAGE_FILES },
      ["error:media-no-alt"],
    ],
    [
      "media file not in the folder",
      { over: publishedImage, files: ["index.md"] },
      ["error:media-missing"],
    ],
    [
      "code entry with no sketch file",
      { over: { sourcePath: '"lib/"' }, files: ["index.md", "lib/helper.tsx"] },
      ["error:no-source-file"],
    ],
    ["code entry without sourcePath", { over: { sourcePath: undefined } }, ["error:no-source-path"]],
    ["sourcePath that doesn't exist", { over: { sourcePath: '"lib/"' } }, ["error:source-path-missing"]],
    [
      "sourcePath that is an empty directory",
      { over: { sourcePath: '"assets/"' }, files: [...CODE_FILES, "assets/.gitkeep"] },
      ["error:source-path-empty"],
    ],
    [
      "code entry whose src/ holds only .gitkeep",
      { over: {}, files: ["index.md", "src/.gitkeep"] },
      ["error:no-source-file","error:source-path-empty"],
    ],
  ];

  // A source text is always supplied; it's only read when the files include a sketch.
  for (const [name, { over, files = CODE_FILES }, expected] of cases) {
    test(name, () => {
      const { problems } = read({ indexMd: indexMd({ ...published, ...over }), files });
      assert.deepEqual(summarize(problems), expected);
    });

    test(`${name}: the same entry as a draft is fine`, () => {
      const { problems } = read({ indexMd: indexMd({ ...published, ...over, publish: "false" }), files });
      assert.deepEqual(problems, []);
    });
  }

  test("a complete published code entry passes", () => {
    assert.deepEqual(read({ indexMd: indexMd(published) }).problems, []);
  });

  test("a complete published image entry passes", () => {
    const input = { indexMd: indexMd(publishedImage), files: IMAGE_FILES, source: undefined };
    assert.deepEqual(read(input).problems, []);
  });

  test("sourcePath may name a file, and written paths are normalised", () => {
    const file = read({ indexMd: indexMd({ ...published, sourcePath: '"./src/index.tsx"' }) });
    const dir = read({ indexMd: indexMd({ ...published, sourcePath: '"src"' }) });
    assert.deepEqual(file.problems, []);
    assert.deepEqual(dir.problems, []);
    const media = read({
      indexMd: indexMd({ ...publishedImage, media: '\n  - src: "./spring.gif"\n    alt: "x"' }),
      files: IMAGE_FILES,
      source: undefined,
    });
    assert.deepEqual(media.problems, []);
  });

  test("a partial listing skips the does-not-exist checks, and only those", () => {
    const base = { ...publishedImage, media: '\n  - src: "spring.gif"\n    alt: "x"' };
    // Absence from a partial listing proves nothing.
    const gone = read({ indexMd: indexMd(base), files: ["index.md"], source: undefined, partial: true });
    assert.deepEqual(gone.problems, []);
    const lib = read({ indexMd: indexMd({ ...published, sourcePath: '"lib/"' }), partial: true });
    assert.deepEqual(lib.problems, []);
    // Everything else still applies.
    const noAlt = read({
      indexMd: indexMd({ ...base, media: '\n  - src: "spring.gif"' }),
      files: IMAGE_FILES,
      source: undefined,
      partial: true,
    });
    assert.deepEqual(summarize(noAlt.problems), ["error:media-no-alt"]);
    const noPath = read({ indexMd: indexMd({ ...published, sourcePath: undefined }), partial: true });
    assert.deepEqual(summarize(noPath.problems), ["error:no-source-path"]);
  });
});

// -- writing frontmatter, and reading it back -------------------------------

describe("round trip", () => {
  const strings = [
    "plain",
    'say "hi"',
    "back\\slash",
    "ends with a backslash \\",
    "trailing \\\" tricky",
    "has # a hash",
    "key: value",
    'all of "them": \\ # together',
    "literal \\n not a newline",
    "tab\there",
    "two\nlines",
    "  padded  ",
    "'single' quotes",
    "- dash first",
    "[]",
    "true",
    "---",
    "café ☕",
  ];

  const fieldsFor = (title) => ({
    title,
    description: `About ${title}`,
    date: "2026-09-03",
    slug: "spring-grid",
    type: "mixed",
    publish: false,
    media: [
      { src: "spring.gif", alt: `Alt: ${title}`, caption: `Caption ${title}` },
      { src: "second.png", alt: "plain alt" },
    ],
    sourcePath: "src/",
  });

  for (const title of strings) {
    test(JSON.stringify(title), () => {
      const fields = fieldsFor(title);
      const written = serializeFrontmatter(fields);
      const { entry, problems } = readEntry({
        dir: DIR,
        indexMd: `${written}\nBody\n`,
        files: asFiles(["index.md", "spring.gif", "second.png", "src/index.tsx"]),
        source: GOOD_SOURCE,
      });
      assert.deepEqual(problems, []);
      assert.equal(entry.title, title);
      assert.equal(entry.description, fields.description);
      assert.deepEqual(entry.media, [
        { src: "spring.gif", alt: `Alt: ${title}`, caption: `Caption ${title}` },
        { src: "second.png", alt: "plain alt", caption: "" },
      ]);
      assert.equal(entry.sourcePath, "src/");
      assert.equal(entry.note, "Body");
    });
  }

  test("optional fields: no media and no sourcePath", () => {
    const written = serializeFrontmatter({
      title: "T",
      date: "2026-09-03",
      slug: "spring-grid",
      type: "image",
    });
    const { entry } = readEntry({ dir: DIR, indexMd: written, files: [] });
    assert.equal(entry.description, "");
    assert.deepEqual(entry.media, []);
    assert.equal(entry.sourcePath, undefined);
    assert.equal(entry.publish, false);
  });

  test("publish: true survives", () => {
    const written = serializeFrontmatter({ title: "T", date: "2026-09-03", slug: "spring-grid", type: "image", publish: true });
    assert.equal(readEntry({ dir: DIR, indexMd: written, files: [] }).entry.publish, true);
  });

  test("every type is accepted, and anything else is refused", () => {
    for (const type of ENTRY_TYPES) {
      assert.doesNotThrow(() => serializeFrontmatter({ title: "T", date: "d", slug: "s", type }));
    }
    assert.throws(() => serializeFrontmatter({ title: "T", date: "d", slug: "s", type: "video" }), TypeError);
  });

  test("a freshly scaffolded draft passes every structural check", () => {
    const scaffold = (type, sourcePath) =>
      readEntry({
        dir: DIR,
        indexMd: `${serializeFrontmatter({ title: "Spring grid", date: "2026-09-03", slug: "spring-grid", type, sourcePath })}\nNote.\n`,
        files: asFiles(sourcePath ? ["index.md", "src/.gitkeep"] : ["index.md"]),
      });
    assert.deepEqual(scaffold("image").problems, []);
    assert.deepEqual(scaffold("code", "src/").problems, []);
  });

  test("keeps the scaffold's explanatory comments", () => {
    const written = serializeFrontmatter({
      title: 'Say "hi"',
      date: "2026-09-03",
      slug: "say-hi",
      type: "code",
      sourcePath: "src/",
    });
    assert.equal(
      written,
      [
        "---",
        'title: "Say \\"hi\\""',
        "# description: 1-2 sentences. Feeds the journal card and the page meta/OG",
        "# tags, so write it for someone who hasn't opened the entry yet.",
        'description: ""',
        'date: "2026-09-03"',
        'slug: "say-hi"',
        "type: code",
        "publish: false",
        "# media: one item per image/GIF. src is relative to this entry folder;",
        "# alt is required once src is set. To fill it in, drop the [] below and",
        "# uncomment the example under it:",
        "media: []",
        '#   - src: "scroll-snap.gif"',
        '#     alt: "Scroll snap prototype moving between image panels"',
        'sourcePath: "src/"  # path to the source file(s), relative to this entry folder',
        "---",
        "",
      ].join("\n"),
    );
  });
});

// -- the other bug fixes ------------------------------------------------------

describe("escaped quotes", () => {
  test('title: "say \\"hi\\"" reads as say "hi"', () => {
    const { entry, problems } = read({ indexMd: indexMd({ title: '"say \\"hi\\""' }) });
    assert.deepEqual(problems, []);
    assert.equal(entry.title, 'say "hi"');
  });

  test("a trailing comment after the closing quote is dropped, an escaped backslash kept", () => {
    const { entry } = read({ indexMd: indexMd({ sourcePath: '"C:\\\\src\\\\"  # a comment' }) });
    assert.equal(entry.sourcePath, "C:\\src\\");
  });

  test("single quotes: '' is an escaped quote", () => {
    const { entry } = read({ indexMd: indexMd({ title: "'it''s'" }) });
    assert.equal(entry.title, "it's");
  });

  test("an unterminated quote is kept as written rather than dropped", () => {
    const { entry } = read({ indexMd: indexMd({ title: '"oops' }) });
    assert.equal(entry.title, '"oops');
  });

  test("unquoted values lose a trailing ` # comment`", () => {
    const { entry } = read({ indexMd: indexMd({ type: "code  # a comment" }) });
    assert.equal(entry.type, "code");
  });
});

describe("CRLF line endings", () => {
  const crlf = (over, opts) => indexMd(over, { eol: "\r\n", ...opts });

  test("a CRLF index.md reads the same as the LF one", () => {
    const over = { media: MEDIA_LIST, description: '"Hi"' };
    const files = [...CODE_FILES, "spring.gif"];
    const lf = read({ indexMd: indexMd(over, { body: "Line one.\nLine two.\n" }), files });
    const cr = read({ indexMd: crlf(over, { body: "Line one.\nLine two.\n" }), files });
    assert.deepEqual(cr.problems, []);
    assert.deepEqual(cr.entry, lf.entry);
    assert.equal(cr.entry.note, "Line one.\nLine two.");
  });

  test("the note has no stray carriage returns", () => {
    const { entry } = read({ indexMd: crlf({}, { body: "One.\r\nTwo.\r\n" }) });
    assert.equal(entry.note.includes("\r"), false);
  });

  test("a leading BOM is ignored", () => {
    assert.deepEqual(read({ indexMd: `\uFEFF${indexMd()}` }).problems, []);
  });

  test("line numbers in syntax problems are unchanged", () => {
    const { problems } = read({ indexMd: crlf({ sourcePath: '"src/"\r\n!!!' }) });
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /^line 10:/);
  });
});

// -- helpers ------------------------------------------------------------------

describe("helpers", () => {
  test("slugify", () => {
    const cases = [
      ["Scroll snap experiment", "scroll-snap-experiment"],
      ["  Spaced  out  ", "spaced-out"],
      ['Say "hi": #1!', "say-hi-1"],
      ["---", ""],
      ["Café", "caf"],
    ];
    for (const [title, slug] of cases) assert.equal(slugify(title), slug, title);
  });

  test("types", () => {
    assert.deepEqual([...ENTRY_TYPES], ["image", "code", "mixed"]);
    assert.equal(isEntryType("code"), true);
    assert.equal(isEntryType("video"), false);
    assert.equal(isEntryType(undefined), false);
    assert.deepEqual(ENTRY_TYPES.filter(typeNeedsSource), ["code", "mixed"]);
    assert.equal(typeNeedsSource(undefined), false);
  });
});

// -- agreement with the playground's literal globs -------------------------

describe("playground/src/sketches.ts globs", () => {
  const text = readFileSync(new URL("../../playground/src/sketches.ts", import.meta.url), "utf8");
  // Vite needs these as literal strings, so the Entry module can't generate
  // them; this test is what stops the two copies of each list drifting apart.
  const globs = [...text.matchAll(/import\.meta\.glob\(\s*"([^"]+)"/g)].map((m) => m[1]);
  const find = (re) => {
    const matches = globs.filter((g) => re.test(g));
    assert.equal(matches.length, 1, `expected exactly one glob matching ${re}, got ${matches}`);
    return matches[0];
  };
  const extensionsOf = (glob) => {
    const braces = glob.match(/\.\{([^}]+)\}$/);
    assert.ok(braces, `no {a,b,c} extension group in ${glob}`);
    return braces[1].split(",");
  };
  const sorted = (list) => [...list].sort();

  test("there are exactly three literal globs", () => {
    assert.equal(globs.length, 3, globs.join("\n"));
    assert.equal(find(/\/index\.md$/), "../../entries/*/index.md");
  });

  test("media glob lists exactly MEDIA_EXTENSIONS, lowercase", () => {
    const glob = find(/\/entries\/\*\/\*\./);
    assert.deepEqual(sorted(extensionsOf(glob)), sorted(MEDIA_EXTENSIONS));
    assert.equal(glob, glob.toLowerCase());
  });

  test("sketch glob is src/index.<exactly SOURCE_EXTENSIONS>", () => {
    const glob = find(/\/src\/index\./);
    assert.ok(glob.startsWith("../../entries/*/src/index."), glob);
    assert.deepEqual(sorted(extensionsOf(glob)), sorted(SOURCE_EXTENSIONS));
  });
});
