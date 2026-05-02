const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
} = require("../index.js");

test("normalizeExtensionTag handles rv prefixes and casing", () => {
  assert.equal(normalizeExtensionTag("rv_zba"), "zba");
  assert.equal(normalizeExtensionTag("rv64_zk"), "zk");
  assert.equal(normalizeExtensionTag("RV32_ZICSR"), "zicsr");
  assert.equal(normalizeExtensionTag("Zba"), "zba");
  assert.equal(normalizeExtensionTag("M"), "m");
  assert.equal(normalizeExtensionTag("rv64im"), "im");
});

test("splitCompositeTag splits rv32_d_zfa and multi-letter base", () => {
  const parts = splitCompositeTag("rv32_d_zfa");
  assert.deepEqual(parts.sort(), ["d", "zfa"].sort());
  const parts2 = splitCompositeTag("rv64imafdc");
  assert.deepEqual(parts2.sort(), ["i", "m", "a", "f", "d", "c"].sort());
});

test("toDisplayName formats tags for output", () => {
  assert.equal(toDisplayName("zba"), "Zba");
  assert.equal(toDisplayName("m"), "M");
  assert.equal(toDisplayName("g"), "G");
});

test("groupByExtension groups mnemonics and finds multi-extension", () => {
  const fake = {
    add: { extension: ["rv_i"] },
    mul: { extension: ["rv_m"] },
    aes32dsi: { extension: ["rv32_zk", "rv32_zkn"] },
    nop: { },
  };

  const { byExtNormalized, multiExtNormalized, missingExtension } = groupByExtension(fake);
  assert.equal(byExtNormalized.get("i").length, 1);
  assert.equal(byExtNormalized.get("m").length, 1);
  assert.equal(byExtNormalized.get("zk").length, 1);
  assert.equal(byExtNormalized.get("zkn").length, 1);
  assert.equal(multiExtNormalized.length, 1);
  assert.equal(multiExtNormalized[0].mnemonic, "aes32dsi");
  assert.deepEqual(missingExtension, ["nop"]);
});

test("extractExtensionsFromText picks up Z-extensions and base letters", () => {
  const text = "This covers `Zba`, `Zicsr`, and `M` plus `F`, plus Zve32f/Zve64f.";
  const hits = extractExtensionsFromText(text);
  assert.ok(hits.has("zba"));
  assert.ok(hits.has("zicsr"));
  assert.ok(hits.has("m"));
  assert.ok(hits.has("f"));
  assert.ok(hits.has("zve32f"));
  assert.ok(hits.has("zve64f"));
});

test("collectCodeTokens pulls from code spans", () => {
  const text = "Some text with `Zba` and +M+.";
  const tokens = collectCodeTokens(text);
  assert.ok(tokens.includes("Zba"));
  assert.ok(tokens.includes("M"));
});

test("filterExtensionTokens keeps plausible extensions only", () => {
  const tokens = ["Zba", "Zicsr", "M", "foo", "sampling"];
  const hits = filterExtensionTokens(tokens);
  assert.ok(hits.has("zba"));
  assert.ok(hits.has("zicsr"));
  assert.ok(hits.has("m"));
  assert.ok(!hits.has("sampling"));
});

test("compareExtensions separates matched, json-only, manual-only", () => {
  const json = new Set(["i", "m", "zba"]);
  const manual = new Set(["i", "zba", "zbb"]);
  const result = compareExtensions(json, manual);
  assert.deepEqual(result.matched, ["i", "zba"]);
  assert.deepEqual(result.jsonOnly, ["m"]);
  assert.deepEqual(result.manualOnly, ["zbb"]);
});

test("normalizeExtensionSet expands g to i/m/a/f/d", () => {
  const input = new Set(["g", "zba"]);
  const { normalized } = normalizeExtensionSet(input);
  for (const ext of ["i", "m", "a", "f", "d"]) {
    assert.ok(normalized.has(ext));
  }
  assert.ok(normalized.has("zba"));
  assert.ok(!normalized.has("g"));
});

test("buildSharedInstructionGraph creates edges for shared mnemonics", () => {
  const byExt = new Map();
  byExt.set("zba", ["add", "sh1add"]);
  byExt.set("zbb", ["add", "and"]);
  byExt.set("m", ["mul"]);
  const edges = buildSharedInstructionGraph(byExt);
  const labels = edges.map((e) => `${e.a}-${e.b}-${e.shared}`).sort();
  assert.deepEqual(labels, ["zba-zbb-1"]);
});

test("buildSharedInstructionGraph respects minShared", () => {
  const byExt = new Map();
  byExt.set("zba", ["add", "sh1add", "x"]);
  byExt.set("zbb", ["add", "and", "x"]);
  const edges = buildSharedInstructionGraph(byExt, { minShared: 2 });
  assert.equal(edges.length, 1);
  assert.equal(edges[0].shared, 2);
});

test("parseArgs handles flags and paths", () => {
  const args = parseArgs([
    "node",
    "index.js",
    "--min-shared",
    "3",
    "--top-edges=10",
    "custom.json",
    "manual/src",
  ]);
  assert.equal(args.minShared, 3);
  assert.equal(args.topEdges, 10);
  assert.equal(args.jsonPath, "custom.json");
  assert.equal(args.manualPath, "manual/src");
});
