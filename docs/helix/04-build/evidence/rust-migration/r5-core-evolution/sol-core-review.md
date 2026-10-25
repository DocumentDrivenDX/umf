---
ddx:
  id: umf.evidence.rust-migration.r5-core-evolution-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: opt-in core evolution checkpoint

On 2026-10-24, Sol independently read the frozen current-TypeScript 0.10
packet, Rust implementation, focused tests and source-pinned checkpoint. Sol
reran the offline Rust 1.90.0 focused suite with an isolated target directory:
7/7 tests passed in 19.73 seconds. `git diff --check` passed. The reviewed
core source SHA-256 is `df72efa4087962355ec0096a03e0d7b97db988fe313ac37207caa68e71a98c3a`.

The earlier review findings were addressed: canonical object comparison now
uses charged ordered maps and rejects duplicate keys; shared-field references
are tracked per record and field; `inspect` validates its own closed receipt.
The frozen two-record case retains the predecessor's refusal. No P1/P2
semantic mismatch was found in this bounded core-only checkpoint.

The next wire/host review must test large unknown-rich objects against the
Context work claim: `get` and `get_mut` scan object members repeatedly, and
their lookup cost is not charged directly. The input value and byte limits
bound the total input, but they do not alone prove proportional work metering.
This is an open resource qualification, not a claim that the core suite failed.

The initial core review did not qualify the tagged wire, Node/Bun, browser
WASM, installed packages, a production default route, CONTRACT-058's 0.8.0
precondition, or the full R5 family. The separate duplicate CONTRACT-058
identifier remains a governance ambiguity.

## Independent successor checks

After the opt-in wire checkpoint, Sol reran `r5_core_evolution_wire` in a
separate offline target directory: 3/3 passed in 61.11 seconds. Sol also ran
the Chromium harness independently against clean extracted WASM archive SHA-256
`c3385834bf4c8b479b4760e5e151fc8779ff374ac2f96a85be77ad622337069b`.
Chromium 153.0.8010.12 matched all seven frozen outcomes, valid and forged
verification, and zero-work/cancellation/deadline controls. The WASM binary
SHA-256 was
`638d8db7fa9a6e86f9d0d01d0159d75b3932ac2d4866509e48c05eafd89f9494`.
The extracted artifact is immutable evidence for that source cohort; later
shared-wire edits require a fresh build before a combined-tree claim. The
unmetered object-member lookup concern above remains open, so this does not
qualify the contract's full resource obligation or a default route.
