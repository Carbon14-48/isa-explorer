# RISC-V Instruction Set Explorer (CLI)

Small Node.js CLI used for the RISC-V Mentorship Coding Challenge. It parses the instruction dictionary, groups by extension, cross-references the ISA manual, and emits a graph of shared instructions.

## Setup

```bash
cd isa-explorer
npm install
```

## Run

```bash
npm start
```

You can also provide explicit paths:

```bash
node index.js ../src/instr_dict.json ../riscv-isa-manual/src
```

Optional graph filters (to reduce clutter):

```bash
node index.js --min-shared 3
node index.js --top-edges 30
```

## Tests

```bash
npm test
```

## Output

- Console output includes Tier 1 and Tier 2 summaries.
- A DOT graph is written to `isa-explorer/output/shared-extensions.dot`.

## Sample Output (abbreviated)

```text
Tier 1 — Instruction Set Parsing
zba | 4 instructions | e.g. SH1ADD
...

Instructions in multiple extensions:
aes32dsi -> Zk, Zkn
...

Tier 2 — Cross-Reference with ISA Manual
Matched: 42
JSON only: 3
Manual only: 5
...

Tier 3 — Graph written to /.../isa-explorer/output/shared-extensions.dot
```

## How It Works (Quick Walkthrough)

- Tier 1: `index.js` loads `src/instr_dict.json`, groups instructions by their raw extension tags, and prints a count plus one example mnemonic per tag. It also lists any instructions that appear under multiple extensions.
- Tier 2: the script walks all `riscv-isa-manual/src/**/*.adoc` files, extracts extension tokens from code spans and file names, normalizes them (e.g., `rv64_zba` -> `zba`, `Zicsr` -> `zicsr`, `G` -> `I/M/A/F/D`), and then reports matched vs missing sets.
- Tier 3: a simple pairwise scan builds a DOT graph where an edge exists if two extensions share at least one mnemonic. The edge label is the shared count.

## Assumptions and Notes

- Tier 1 prints raw extension tags as they appear in `instr_dict.json` to match the example format; Tier 2 uses a normalized form for cross-referencing.
- Normalization removes `rv`, `rv32`, `rv64` prefixes, lowercases tags, and expands `G` to `I/M/A/F/D` for matching.
- Manual scan pulls extension mentions from AsciiDoc code spans and file names to avoid noise from narrative text.
- Manual scan also includes strict regex matches for extension-like tokens (e.g., `Zve32f`, `Sstc`, `H`), and filters out known non-extension filenames.
- Graph edges connect any extensions that share at least one mnemonic; edge labels show shared count.
- The CLI prints a small validation section showing total instructions and any entries missing extension tags.

## Normalization and Mismatch Handling

- `rv64_zba` (JSON) -> `zba` (normalized) -> `Zba` (display)
- `Zicsr` (manual) -> `zicsr` (normalized) -> matches JSON `rv_zicsr`
- `G` (manual shorthand) -> expanded to `I/M/A/F/D` for matching
- `rv32_d_zfa` (JSON) -> split to `d` and `zfa` for cross-reference

## Edge-Case Coverage

- JSON tags that bundle multiple base extensions (e.g., `rv64imafdc`) are split into individual base letters for cross-reference.
- Composite JSON tags with suffixes (e.g., `rv32_d_zfa`) are split into multiple normalized tags.
- Manual text with slash-separated extensions (e.g., `Zve32f/Zve64f`) is split and normalized.
- Manual tokens are extracted from code spans and strict extension-like patterns to avoid narrative noise.

## Limitations

- Some extension mentions that appear only in prose (not code spans or strict patterns) may be missed to keep false positives low.
