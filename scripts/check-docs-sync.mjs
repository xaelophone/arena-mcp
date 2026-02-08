import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
}

function extractMatches(text, regex) {
  const values = [];
  let match = regex.exec(text);
  while (match) {
    values.push(match[1]);
    match = regex.exec(text);
  }
  return values;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function formatList(values) {
  return values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "  (none)";
}

function diff(actual, expected) {
  return {
    missing: expected.filter((value) => !actual.includes(value)),
    extra: actual.filter((value) => !expected.includes(value)),
  };
}

function parseApiReference(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = [];

  let section = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const headingMatch = line.match(/^###\s+`([^`]+)`$/);
    if (headingMatch) {
      headings.push({
        section,
        name: headingMatch[1],
        line: index,
      });
    }
  }

  const bySection = {
    resources: [],
    readTools: [],
    writeTools: [],
    prompts: [],
  };
  const missingExamples = [];

  for (let index = 0; index < headings.length; index += 1) {
    const item = headings[index];
    const next = headings[index + 1];
    const endLine = next ? next.line : lines.length;
    const block = lines.slice(item.line + 1, endLine).join("\n");

    if (item.section === "Resources") {
      bySection.resources.push(item.name);
    } else if (item.section === "Read Tools") {
      bySection.readTools.push(item.name);
      if (!/^#### Example$/m.test(block)) {
        missingExamples.push(item.name);
      }
    } else if (item.section === "Write Tools") {
      bySection.writeTools.push(item.name);
      if (!/^#### Example$/m.test(block)) {
        missingExamples.push(item.name);
      }
    } else if (item.section === "Prompts") {
      bySection.prompts.push(item.name);
    }
  }

  return {
    resources: sortedUnique(bySection.resources),
    readTools: sortedUnique(bySection.readTools),
    writeTools: sortedUnique(bySection.writeTools),
    prompts: sortedUnique(bySection.prompts),
    missingExamples: sortedUnique(missingExamples),
  };
}

function checkMarkdownLinks(relPath) {
  const text = read(relPath);
  const parentDir = path.dirname(path.join(repoRoot, relPath));
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;
  const missing = [];

  let match = linkRegex.exec(text);
  while (match) {
    const href = match[1].trim();
    if (
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("#")
    ) {
      match = linkRegex.exec(text);
      continue;
    }

    const withoutAnchor = href.split("#")[0];
    if (withoutAnchor === "") {
      match = linkRegex.exec(text);
      continue;
    }

    const resolved = path.resolve(parentDir, withoutAnchor);
    if (!fs.existsSync(resolved)) {
      missing.push(`${relPath} -> ${href}`);
    }

    match = linkRegex.exec(text);
  }

  return sortedUnique(missing);
}

const readToolsSource = read("src/mcp/tools-read.ts");
const writeToolsSource = read("src/mcp/tools-write.ts");
const promptsSource = read("src/mcp/prompts.ts");
const resourcesSource = read("src/mcp/resources.ts");
const apiReference = read("docs/api-reference.md");

const sourceReadTools = sortedUnique(
  extractMatches(readToolsSource, /registerTool\(\s*"([^"]+)"/g),
);
const sourceWriteTools = sortedUnique(
  extractMatches(writeToolsSource, /registerTool\(\s*"([^"]+)"/g),
);
const sourcePrompts = sortedUnique(extractMatches(promptsSource, /registerPrompt\(\s*"([^"]+)"/g));
const sourceResources = sortedUnique([
  ...extractMatches(resourcesSource, /new ResourceTemplate\("([^"]+)"/g),
  ...extractMatches(resourcesSource, /registerResource\(\s*"[^"]+"\s*,\s*"([^"]+)"/g),
]);

const docs = parseApiReference(apiReference);

const results = [
  {
    label: "Read tools",
    source: sourceReadTools,
    docs: docs.readTools,
  },
  {
    label: "Write tools",
    source: sourceWriteTools,
    docs: docs.writeTools,
  },
  {
    label: "Prompts",
    source: sourcePrompts,
    docs: docs.prompts,
  },
  {
    label: "Resources",
    source: sourceResources,
    docs: docs.resources,
  },
];

const linkErrors = sortedUnique([
  ...checkMarkdownLinks("README.md"),
  ...checkMarkdownLinks("docs/README.md"),
]);

let hasFailures = false;

for (const result of results) {
  const changes = diff(result.docs, result.source);
  const hasMismatch = changes.missing.length > 0 || changes.extra.length > 0;
  if (hasMismatch) {
    hasFailures = true;
    console.error(`\n[docs:check] ${result.label} mismatch`);
    console.error("Expected from source:\n" + formatList(result.source));
    console.error("Documented in docs/api-reference.md:\n" + formatList(result.docs));
    console.error("Missing from docs:\n" + formatList(changes.missing));
    console.error("Unexpected in docs:\n" + formatList(changes.extra));
  }
}

if (docs.missingExamples.length > 0) {
  hasFailures = true;
  console.error("\n[docs:check] Missing `#### Example` sections for tools:");
  console.error(formatList(docs.missingExamples));
}

if (linkErrors.length > 0) {
  hasFailures = true;
  console.error("\n[docs:check] Broken local markdown links:");
  console.error(formatList(linkErrors));
}

if (hasFailures) {
  process.exit(1);
}

console.log("[docs:check] docs are in sync with source and local links are valid.");
