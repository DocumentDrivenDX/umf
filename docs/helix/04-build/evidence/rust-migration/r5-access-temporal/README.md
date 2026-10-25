---
ddx:
  id: umf.evidence.rust-migration.r5-access-temporal
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
---

# Access temporal tagged parser candidate

This candidate implements the explicit `umf-access-temporal/0.1.0` token profile from CONTRACT-075 in Rust core, then exposes `parseAccessTemporal` through an opt-in `umf.core-wire/1` tagged operation. It covers the exact `date`, `local`, and known-offset `instant` grammar, UTF-16 token limit and refusal order, Gregorian date and clock validation, six-digit microsecond padding, negative-epoch UTC seconds, UTC canonicalization, and normalized years 0001–9999. It uses the already-owned Gregorian and RFC3339 exact-instant kernels; it does not invoke a host date, timezone, locale, or clock API.

[`predecessor.json`](predecessor.json) freezes 56 cases on Bun 1.4.3: all 38 existing golden vectors, explicit +/-23:60 offset refusals, signed +/-23:59 normalization, UTC year underflow/overflow, six-digit zero fraction, wrong kind/token types, kind-vs-length and token-type-vs-kind order, UTF-16 length boundary, plus eight raw JavaScript host inputs (null, number, object, array, `Date`, boxed string, proxy and accessor object). The eight raw-host cases are predecessor evidence only: the tagged value grammar cannot carry these JS object distinctions. The proxy trap and accessor getter are recorded as uninvoked; no raw-host parity is claimed. The packet pins the public adapter, both dependent TypeScript parsers, fixture, acceptance test and CONTRACT-075. `replay.ts` checks those source hashes and replayed all 56/56 current-source cases.

The Rust integration test replays every non-host frozen case and compares every output property, TypeError/RangeError class, and exact message. This is 48 tagged predecessor cases; the eight host-only cases remain outside the wire claim. `kind` and `token` are required tagged arguments. For the 48 tagged predecessor cases, the wire reports `TYPE_ERROR` or `RANGE_ERROR` with the exact captured source message. Date, clock, offset, known-offset, precision and normalized-range branches are checked before calling the exact-instant core. That parser’s failure fallback is an internal-invariant guard unreachable after those checks; no claim extends to any new grammar or changed dependency behavior. The helper is pure profile parsing only: it does not select a profile for a bare core date/timestamp, validate schema or Python carrier classes, establish binding admission, or qualify a native/backend.

The pre-existing `canonicalize_access_temporal` core operation handles fields already extracted from Python `date`/`datetime` carriers. This parser is a separate token operation; it does not alter that host-admission responsibility or imply Python, Node/Bun, WASM, CLI, installed package, or default-root routing.

## Reproduction

```sh
bun docs/helix/04-build/evidence/rust-migration/r5-access-temporal/replay.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-access-temporal-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  test -p umf-core-wire --test access_temporal_wire --offline
```

## Source and evidence SHA-256

See [`hashes.txt`](hashes.txt) for the frozen implementation, predecessor, fixture, test, and contract file identities. The source files are moving shared-worktree inputs; recapture this table at integration freeze.
