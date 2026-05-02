const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_JSON = path.join(ROOT, "src", "instr_dict.json");
const DEFAULT_MANUAL_SRC = path.join(ROOT, "riscv-isa-manual", "src");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "output");

function normalizeExtensionTag(tag) {
  if (!tag) return null;
  const raw = String(tag).trim();
  if (!raw) return null;

  let cleaned = raw.toLowerCase();
  cleaned = cleaned.replace(/^rv(32|64)?_/, "");
  cleaned = cleaned.replace(/^rv(32|64)?/, "");
  cleaned = cleaned.replace(/[^a-z0-9]/g, "");
  if (!cleaned) return null;

  if (cleaned === "g") return "g";
  return cleaned;
}

function splitCompositeTag(tag) {
  if (!tag) return [];
  const raw = String(tag).trim();
  if (!raw) return [];

  let cleaned = raw.toLowerCase();
  cleaned = cleaned.replace(/^rv(32|64)?_?/, "");
  if (!cleaned) return [];

  const parts = cleaned.split("_").filter(Boolean);
  const expanded = [];

  for (const part of parts) {
    if (!part) continue;
    // Split bundled base extensions like "imafdc" into individual letters.
    if (/^[imafdgcqkvhu]+$/.test(part) && part.length > 1) {
      for (const ch of part.split("")) expanded.push(ch);
      continue;
    }
    expanded.push(part);
  }

  return expanded.map(normalizeExtensionTag).filter(Boolean);
}

function toDisplayName(normalized) {
  if (!normalized) return "";
  if (normalized.length === 1) return normalized.toUpperCase();
  if (normalized.startsWith("z")) {
    return `Z${normalized.slice(1)}`;
  }
  return normalized.toUpperCase();
}

function loadInstrDict(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function groupByExtension(instrDict) {
  const byExtRaw = new Map();
  const byExtNormalized = new Map();
  const multiExtRaw = [];
  const multiExtNormalized = [];
  const missingExtension = [];

  for (const [mnemonic, data] of Object.entries(instrDict)) {
    const extList = Array.isArray(data.extension)
      ? data.extension
      : data.extension
        ? [data.extension]
        : [];
    if (extList.length === 0) missingExtension.push(mnemonic);

    const raw = extList.map((ext) => String(ext));
    const normalized = raw.flatMap(splitCompositeTag);

    if (raw.length > 1) {
      multiExtRaw.push({ mnemonic, extensions: raw });
    }
    if (normalized.length > 1) {
      multiExtNormalized.push({ mnemonic, extensions: normalized });
    }

    for (const ext of raw) {
      if (!byExtRaw.has(ext)) byExtRaw.set(ext, []);
      byExtRaw.get(ext).push(mnemonic);
    }

    for (const ext of normalized) {
      if (!byExtNormalized.has(ext)) byExtNormalized.set(ext, []);
      byExtNormalized.get(ext).push(mnemonic);
    }
  }

  return {
    byExtRaw,
    byExtNormalized,
    multiExtRaw,
    multiExtNormalized,
    missingExtension,
  };
}

function formatTier1(byExt, multiExt) {
  const lines = [];
  const extNames = Array.from(byExt.keys()).sort();
  for (const ext of extNames) {
    const mnemonics = byExt.get(ext);
    const example = mnemonics[0] ? mnemonics[0].toUpperCase() : "";
    lines.push(`${ext} | ${mnemonics.length} instructions | e.g. ${example}`);
  }

  const multiLines = [];
  for (const item of multiExt.sort((a, b) => a.mnemonic.localeCompare(b.mnemonic))) {
    const list = item.extensions.join(", ");
    multiLines.push(`${item.mnemonic} -> ${list}`);
  }

  return { lines, multiLines };
}

function listAsciiDocFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listAsciiDocFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".adoc")) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectCodeTokens(text) {
  const tokens = [];
  const codeTicks = text.match(/`[^`]+`/g) || [];
  for (const block of codeTicks) {
    tokens.push(...block.replace(/`/g, " ").split(/[^A-Za-z0-9_+\/-]/));
  }

  const codePlus = text.match(/\+[^+]+\+/g) || [];
  for (const block of codePlus) {
    tokens.push(...block.replace(/\+/g, " ").split(/[^A-Za-z0-9_+\/-]/));
  }

  return tokens.filter(Boolean);
}

function filterExtensionTokens(tokens) {
  const hits = new Set();
  const baseLetters = new Set(["i", "m", "a", "f", "d", "g", "c", "v", "b", "k", "q", "h", "s", "u"]);

  for (const token of tokens) {
    const normalized = normalizeExtensionTag(token);
    if (!normalized) continue;
    if (normalized.startsWith("z") && normalized.length > 1) {
      hits.add(normalized);
      continue;
    }
    if (baseLetters.has(normalized)) {
      hits.add(normalized);
      continue;
    }
  }

  return hits;
}

function isExtensionLike(normalized) {
  if (!normalized) return false;
  const baseLetters = new Set(["i", "m", "a", "f", "d", "g", "c", "v", "b", "k", "q", "h", "s", "u"]);
  if (normalized.length === 1 && baseLetters.has(normalized)) return true;
  if (normalized.startsWith("z") && normalized.length > 1) return true;
  if (normalized.startsWith("s") && normalized.length > 1) {
    if (/^sv[0-9]+/.test(normalized)) return true;
    if (/^sv/.test(normalized)) return true;
    if (/^ss/.test(normalized)) return true;
    if (/^sm/.test(normalized)) return true;
    if (/^sh/.test(normalized)) return true;
  }
  if (normalized.startsWith("h") && normalized.length > 1) return true;
  return false;
}

function extractExtensionsFromText(text) {
  const tokens = collectCodeTokens(text);
  const extra = [];

  // Strict patterns for extension-like tokens in prose.
  const regex = /\b(Z[a-z0-9]+|S[a-z0-9]+|H[a-z0-9]+|[IMAFDGVBKQHUS])\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    extra.push(match[1]);
  }

  const combined = tokens.concat(extra).flatMap((tok) => tok.split(/[\/]/));
  return filterExtensionTokens(combined);
}

function normalizeExtensionSet(extSet) {
  const expanded = new Set();
  const removals = new Set(["g"]);

  for (const ext of extSet) {
    if (!ext) continue;
    if (ext === "g") continue;
    expanded.add(ext);
  }

  if (extSet.has("g")) {
    for (const base of ["i", "m", "a", "f", "d"]) {
      expanded.add(base);
    }
  }

  return { normalized: expanded, removed: removals };
}

function scanManualExtensions(srcDir) {
  const files = listAsciiDocFiles(srcDir);
  const all = new Set();
  // Avoid non-extension document filenames to reduce noise.
  const deny = new Set([
    "intro",
    "index",
    "preface",
    "rationale",
    "license",
    "contributors",
    "bibliography",
    "symbols",
    "naming",
    "unpriv",
    "priv",
    "machine",
    "hypervisor",
    "matrix",
    "memorymodels",
    "mmexplanatory",
    "mmformal",
    "riscvspec",
    "insns",
    "csrs",
    "cfi",
    "cmo",
    "vectorcrypto",
    "scalarcrypto",
    "vectorexamples",
    "bitmanipexamples",
    "codeexamples",
    "profiles",
  ]);

  for (const filePath of files) {
    const baseName = path.basename(filePath, ".adoc");
    const baseNormalized = normalizeExtensionTag(baseName);
    if (isExtensionLike(baseNormalized) && !deny.has(baseNormalized)) {
      all.add(baseNormalized);
    }

    const content = fs.readFileSync(filePath, "utf8");
    const hits = extractExtensionsFromText(content);
    for (const ext of hits) all.add(ext);
  }

  return all;
}

function compareExtensions(fromJson, fromManual) {
  const jsonOnly = [];
  const manualOnly = [];
  const matched = [];

  const jsonNorm = normalizeExtensionSet(fromJson).normalized;
  const manualNorm = normalizeExtensionSet(fromManual).normalized;

  for (const ext of jsonNorm) {
    if (manualNorm.has(ext)) matched.push(ext);
    else jsonOnly.push(ext);
  }

  for (const ext of manualNorm) {
    if (!jsonNorm.has(ext)) manualOnly.push(ext);
  }

  jsonOnly.sort();
  manualOnly.sort();
  matched.sort();

  return { jsonOnly, manualOnly, matched };
}

function buildSharedInstructionGraph(byExt, options = {}) {
  const minShared = Number.isInteger(options.minShared) ? options.minShared : 1;
  const topEdges = Number.isInteger(options.topEdges) ? options.topEdges : null;
  const extList = Array.from(byExt.keys()).sort();
  const mnemonicSets = new Map();
  for (const ext of extList) {
    mnemonicSets.set(ext, new Set(byExt.get(ext)));
  }

  const edges = [];
  for (let i = 0; i < extList.length; i += 1) {
    for (let j = i + 1; j < extList.length; j += 1) {
      const a = extList[i];
      const b = extList[j];
      const aSet = mnemonicSets.get(a);
      const bSet = mnemonicSets.get(b);
      let shared = 0;
      for (const m of aSet) {
        if (bSet.has(m)) shared += 1;
      }
      if (shared > 0) {
        edges.push({ a, b, shared });
      }
    }
  }
  const filtered = edges.filter((edge) => edge.shared >= minShared);
  filtered.sort((x, y) => y.shared - x.shared || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  if (topEdges !== null) return filtered.slice(0, topEdges);
  return filtered;
}

function writeDotGraph(edges, outputPath) {
  const lines = ["graph extensions {", "  overlap=false;", "  splines=true;"];
  for (const edge of edges) {
    const left = toDisplayName(edge.a);
    const right = toDisplayName(edge.b);
    lines.push(`  "${left}" -- "${right}" [label="${edge.shared}"];`);
  }
  lines.push("}");
  fs.writeFileSync(outputPath, lines.join("\n"), "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseArgs(argv) {
  const args = {
    jsonPath: DEFAULT_JSON,
    manualPath: DEFAULT_MANUAL_SRC,
    minShared: 1,
    topEdges: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--min-shared" && argv[i + 1]) {
      args.minShared = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (token.startsWith("--min-shared=")) {
      args.minShared = Number.parseInt(token.split("=")[1], 10);
      continue;
    }
    if (token === "--top-edges" && argv[i + 1]) {
      args.topEdges = Number.parseInt(argv[i + 1], 10);
      i += 1;
      continue;
    }
    if (token.startsWith("--top-edges=")) {
      args.topEdges = Number.parseInt(token.split("=")[1], 10);
      continue;
    }
    if (!args.jsonPath || args.jsonPath === DEFAULT_JSON) {
      args.jsonPath = token;
      continue;
    }
    if (!args.manualPath || args.manualPath === DEFAULT_MANUAL_SRC) {
      args.manualPath = token;
      continue;
    }
  }

  if (!Number.isInteger(args.minShared) || args.minShared < 1) args.minShared = 1;
  if (args.topEdges !== null && (!Number.isInteger(args.topEdges) || args.topEdges < 1)) {
    args.topEdges = null;
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const jsonPath = args.jsonPath;
  const manualPath = args.manualPath;

  if (!fs.existsSync(jsonPath)) {
    console.error(`instr_dict.json not found at ${jsonPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(manualPath)) {
    console.error(`ISA manual src not found at ${manualPath}`);
    process.exit(1);
  }

  const instrDict = loadInstrDict(jsonPath);
  const {
    byExtRaw,
    byExtNormalized,
    multiExtRaw,
    missingExtension,
  } = groupByExtension(instrDict);
  const tier1 = formatTier1(byExtRaw, multiExtRaw);

  console.log("Tier 1 — Instruction Set Parsing");
  for (const line of tier1.lines) console.log(line);

  console.log("\nInstructions in multiple extensions:");
  if (tier1.multiLines.length === 0) {
    console.log("(none)");
  } else {
    for (const line of tier1.multiLines) console.log(line);
  }

  console.log("\nValidation — Instruction Coverage");
  console.log(`Total instructions: ${Object.keys(instrDict).length}`);
  console.log(`Missing extension tag: ${missingExtension.length}`);
  if (missingExtension.length > 0) {
    console.log(`Missing list (first 20): ${missingExtension.slice(0, 20).join(", ")}`);
  }

  const manualExts = scanManualExtensions(manualPath);
  const jsonExts = new Set(Array.from(byExtNormalized.keys()));
  const comparison = compareExtensions(jsonExts, manualExts);

  console.log("\nTier 2 — Cross-Reference with ISA Manual");
  console.log(`Matched: ${comparison.matched.length}`);
  console.log(`JSON only: ${comparison.jsonOnly.length}`);
  console.log(`Manual only: ${comparison.manualOnly.length}`);
  console.log("\nExtensions present in instr_dict.json but not in manual:");
  console.log(comparison.jsonOnly.length ? comparison.jsonOnly.join(", ") : "(none)");
  console.log("\nExtensions mentioned in manual but not in instr_dict.json:");
  console.log(comparison.manualOnly.length ? comparison.manualOnly.join(", ") : "(none)");

  ensureDir(DEFAULT_OUTPUT_DIR);
  const dotPath = path.join(DEFAULT_OUTPUT_DIR, "shared-extensions.dot");
  const edges = buildSharedInstructionGraph(byExtNormalized, {
    minShared: args.minShared,
    topEdges: args.topEdges,
  });
  writeDotGraph(edges, dotPath);
  console.log(`\nTier 3 — Graph written to ${dotPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeExtensionTag,
  splitCompositeTag,
  toDisplayName,
  groupByExtension,
  extractExtensionsFromText,
  collectCodeTokens,
  filterExtensionTokens,
  normalizeExtensionSet,
  compareExtensions,
  buildSharedInstructionGraph,
  parseArgs,
};
