---
ddx:
  id: TD-078
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-078
      kind: informed_by
    - id: CONTRACT-059
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# TD-078: Public-company intelligence fixed corpus

## Scope and Technical Approach

Implement US-078 under FEAT-027 and CONTRACT-052/053/057. Reuse SD-026's table-to-ontology mapping and fixed external-source mode. Browser-compatible TypeScript projections parse exact native JSON; host-only tooling selects and pins public sources, builds CSVs/schemas and records the observed coverage.

For the shared-engine migration, CONTRACT-059 projection profile 2.0.0 moves the two public SEC projections into the Rust core. Node/Bun, browser WebAssembly, Python, and CLI entrypoints use host-specific admission and presentation around the same Rust semantics. The TypeScript implementation remains the explicit reference route during differential qualification.

## Component Changes

- `src/domain-packs/public-company.ts`: local-only projections, exported through the public entrypoint.
- `scripts/domain-packs/public-company.ts`: deterministic local build from selected snapshots; no hidden network calls.
- `spec/domain-packs/public-company-intelligence/`: canonical schema/ontology/source/CSV/scenario corpus.
- Existing exporter/explorer discover the added pack without a custom UI or generator registry.

## API/Interface Design

CONTRACT-059 owns projection interfaces and domain rules. CONTRACT-052/053 own metadata/export and fixed profile. The ontology helper retains Record/Key/Relationship identity; attributable assertions remain records.

The Rust boundary accepts UTF-16 code units for source JSON and source ID so numeric tokens, unknown content, JSON member order, and isolated surrogates survive without a `serde_json::Value` conversion. Node and browser wrappers admit typed text before dispatch; Python uses a surrogate-preserving conversion; the CLI uses an explicitly bounded text frame. Bindings present the same ordinary projection errors and structured `UmfError` limits. They do not implement SEC row decisions independently.

## Data Model Changes

Companies and identifiers are separate from universe membership. Snapshots link to company IDs; filings link to snapshots; document metadata references pinned originals. Financial observations retain native fragments and source ordinals. Events derive only from disclosed item metadata. Signal results and authored hypotheses have explicit run/rule/evidence links. No ticker identity merge or latest-fact selection.

## Integration Points

Explicit caller download produces reviewed local SEC submissions/Company Facts/document inputs. Offline build reads these pins; TableSpec ingests projected CSVs through its existing spool/ZIP path. A portable graph candidate may be projected from that archive, with no native graph acceptance claim.

## Security and Performance

No credentials, remote library access, artifact-supplied execution or production writes. Enforce pack export budgets and explicit source selection. Use immutable source pins and reuse unchanged sources; measure bytes/rows. Financial values remain exact text. Treat documents as evidence bytes rather than executable markup.

Projection 2.0.0 performs a complete validation and saturating output-size preflight before materializing rows. A later malformed row retains precedence over a projected output-limit refusal. The second pass emits at most 32 Mi UTF-16 code units of ordered JSON and never truncates. Per-row temporary objects may be bounded by the admitted input; retained output rows and wire buffers are allocated only after preflight succeeds. Measure peak memory on installed Node/Bun, Python, and real browser hosts before cutover.

## Testing

STP-078 allocates Bun projection/domain negatives, deterministic build/export, independent local consumer readback and real Chromium checks. Public-company windows cover recent arrays only; historical shard retrieval is explicitly deferred.

The Rust cutover additionally needs frozen predecessor vectors for malformed and duplicate JSON, exact numeric lexemes, integer-like key order, unpaired surrogates, invalid host values, source identity and input resource boundaries. Test output cap minus one, cap, and cap plus one end to end; an over-limit prefix followed by a malformed row must report the row error. Installed Node/Bun, Python wheel, CLI and Chromium/WASM replays must share the pinned source and artifact identity before selecting the default route.

## Migration and Rollback

Additive pack and exports; existing packs remain unchanged. Remove the pack/entrypoint exports and rebuild explorer to roll back. No deployed service or database migration.

## Implementation Sequence

1. Author tests for exact source/context preservation and screen counterexamples.
2. Implement projections and fixed corpus builder; select and pin local source bytes.
3. Export, ingest and independently verify archive/engine results.
4. Build browser assets and verify explorer visibility/downloads; record evidence.

## Risks

Source access differs by execution environment; this machine's reachability is not Databricks evidence. Recent-array coverage is bounded. A metadata event is less specific than a narrative deal read. Model routing, offering-specific ranking and email remain consumer work.

## Shared loader integration

Adopt CONTRACT-057's checksum-pinned finite inventory companion and trusted
export/admission implementation from the shared loader worktree. The new domain
profile is deliberately reassigned CONTRACT-059 to avoid an ID collision; all
local downstream references follow it. The pack's canonical companion README
remains exact; domain instructions move to GUIDE.md. Source acquisition produces
immutable full responses; a future explicit adapter selects current publication
objects, applies the scoped projection and authors a new corpus revision.
Existing fixed data is not silently refreshed by the loader. Verify actual
standalone replay/export closure and injected acquisition/refresh failure
behavior separately from any live transport claim.
