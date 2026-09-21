# Working in UMF

This repository uses HELIX. Read `.helix.yml` and engage the installed
`helix` skill for governed planning and documentation work.

- Keep project artifacts under `docs/helix/` in the matching activity.
- Resolve the graph, templates, and prompts from the installed HELIX plugin;
  do not copy the methodology catalog into this repository.
- Read governing upstream artifacts before authoring downstream documents.
- Preserve artifact IDs, frontmatter, and deliberate `ddx.links` traceability.
- Record unknowns explicitly. Do not infer UMF's purpose from its name.

Start with `docs/helix/README.md`. Product direction, functional requirements,
and cross-cutting requirements are captured separately. Architecture and the
project test plan target a JSON Schema + Protobuf spike. The experimental core
envelope and JSON Schema Draft 2020-12 adapter have Bun, Chromium and scoped
independent native-oracle evidence. A Protobuf descriptor foundation also has
compiler and browser evidence, optional WASM source import and native behavior
checks. Edited-source round trips also pass; Edition 2024 source operations and broader
adapters remain unfinished.
Read CONTRACT-001 through CONTRACT-011 and the
implementation plan execution evidence before extending the implementation.

Never silently lose meaning. Preserve native semantics and unknown extension
content, make cross-system loss explicit, and qualify every support claim with
its versions, subset, and evidence. Prefer TypeScript compiled to browser-compatible
JavaScript; use Bun for development and testing (ADR-002). Keep Bun/Node-specific
APIs outside the browser library and verify behavior in a real browser.
DDD is an early semantic extension, not UMF's governing worldview. Core plus
extensions must support programmatic metadata consumers and preserve competing
storage/compute meanings, including content not yet understood.
