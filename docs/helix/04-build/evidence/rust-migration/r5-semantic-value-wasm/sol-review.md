---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value-wasm.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-semantic-value-wasm
      kind: reviews
    - id: CONTRACT-078
      kind: informed_by
---

# Sol review of the bounded semantic-value WASM transport

I reviewed the WASM Rust callback bridge, JavaScript registry facade, public
types, frozen v3 replay, host-control path and evidence. Review found two
defects before qualification: direct `options.controls` access could invoke a
getter outside descriptor admission, and `reportedWork` was cast to `usize`
before charging on wasm32. The implementation now uses `codegenOptions` before
binding access and parses the JavaScript-safe amount to `u64` for
`Context::charge_work_u64`. The core wire admits callback tokens only through
its safe-integer check.

I independently reran the six focused wrapper tests (15 expectations) and
the repository-owned Chromium replay against the isolated optimized package
after the initializer was added. The initializer admits options before loading,
initializes a fresh module once and returns a working registry.
Chromium 153.0.8010.12 passed 14 frozen direct, 10 registration and five
aggregate entries, including refusal-before-callback; exact `4,294,967,315`
work was observed as `4,294,967,295` plus `20` meter chunks. Invalid work,
dispatcher exception privacy and host-control provenance also passed. The
source/test/frozen/artifact SHA-256 values are pinned in the sibling README.

No P1/P2 remains in this opt-in synchronous trusted callback subset. This
review does not establish default package routing, preemptive callback limits,
general browser semantic-type completeness, installed SDK parity or TypeScript
retirement.
