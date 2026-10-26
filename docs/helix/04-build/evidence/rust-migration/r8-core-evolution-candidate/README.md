---
ddx:
  id: umf.evidence.rust-migration.r8-core-evolution-candidate
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-058
      kind: implements
    - id: ADR-006
      kind: informed_by
---

# R8 Core Evolution Rust candidate

`src/access/rust-core-evolution-candidate.ts` is a private adapter over the
existing Node core-model engine's Rust-owned `inspectCoreEvolution` and
`verifyCoreEvolution` operations. It maps `CORE_EVOLUTION_*` native errors to
the public `UmfError` class and leaves Rust-only resource/control errors
unchanged. Neither V4 root selects the adapter; the TypeScript reference
remains the package-root behavior.

The focused test compares Rust inspection with all seven cases in the frozen
current-source 0.10 packet, verifies a current receipt, rejects a forged
receipt, and checks the adapter's semantic/resource error handling. The
candidate-specific test and repository type check pass:

```sh
bun test tests/core/rust-core-evolution-candidate.test.ts
bun run typecheck
```

The observed run passed 3 tests (12 assertions); typecheck passed. This is a
local Node binding check, not a built V4 default package or installed-package
qualification.

## Default-route gate remains open

No V4 export was replaced because CONTRACT-058's full acceptance and resource
matrix is not yet proven. The existing R5 evidence records a source/contract
version divergence: the contract names a 0.8.0 precondition while the frozen
predecessor and current generated core schema use 0.10.0. The seven-case packet
does not establish every listed negative control. Current tests also do not
pin exact aggregate boundaries at 100,000 values, 4,000,000 serialized bytes,
and 1,000,000 semantic-work units, or every crossed-control first-fault
combination. Existing installed Node/Bun/Chromium receipts belong to an older
artifact/source closure and are not current V4 evidence. The adapter remains
private until those gates pass or the governing contract is reconciled.
