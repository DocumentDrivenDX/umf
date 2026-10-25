---
ddx:
  id: umf.evidence.rust-migration.r8-core-relationships-default-boundary.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-core-relationships-default-boundary
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
---

# Independent Sol review: Core relationship default route

Sol inspected the staged Rust wire admission functions, the one-use private
receipt handle in both Node and WASM wrappers, and the V4 root overrides.
The binding copies each host operand in the predecessor's order, while Rust
validates the lookup identity, declaration request or verification receipt
before the next operand is admitted. `./reference` remains a separate
TypeScript route.

Sol independently reran the staged Rust relationship wire suite (2/2), the
frozen eleven-case packet check, and installed Bun and Node comparisons
(11/11 each). Direct Node execution of the TypeScript test harness failed on
extensionless fixture imports; the reproducible Node-target bundle documented
in the [receipt](README.md) ran under Node 26.12.1 and matched all eleven
outcomes and Proxy reflection traces. Sol also reran the real Chromium 153
comparison (11/11, no `process` or `Buffer`) with the package's WASM file.
The predecessor packet SHA-256 is
`1122fc4d019f055570ea72baf88788818091dd513c05f9070624cba15dedb71e`;
the installed Node entry, addon, browser entry and WASM SHA-256 values are
`c84b6966be1f577805e0b0fb15cc30e9dcfeaaa6e4633e11b53e058cf13029fe`,
`8723b9868f209c3ff535a29a4b50088a5cd665537de60568a081046c0d85ea99`,
`6f7cc7e3aca9f536e1748ad0a78e393accf8f6a427a36dd6575e4d1754e58751`,
and `3a60df995dc3115ba90e6421b1de1a01002379bfb5e10b4ec35340177b5f4878`.

This accepts a private route checkpoint for the captured package only. The
manifest SHA-256 `23e4d3ca3dc86163857559ea78d9af5608d49e505ac797aa33b86bca4805d374`
reports eleven generated inputs transformed during the private build and
labels it nonpublishable. Broader relationship semantics, resource controls
not present in the public V4 function signatures, the `./reference` subpath,
the full executable retirement census, and release qualification remain
open. A fixed-point source rebuild and fresh installed replay are required.

## Regenerated fixed-point replay — 2026-10-25

The metamodel and action-identity generators refreshed exactly the eleven
inputs named by the first manifest. Their check-only modes, typecheck, the
relationship wire suite (2/2), and wrapper tests (6/6) passed. Sol verified
that the successor manifest SHA-256 is
`266731cf3139f33b060b13a7581e8536a6a66266c8fb71832d2a7c8de0adc418`,
its live and captured source hashes both equal
`64a1c040fba85e67521eb0f636f08e0711278bd09347beab96e18dfc1459665b`,
and its transform reports `fixed-point` with zero changed inputs. Sol then
independently reran the installed Bun and bundled-Node eleven-case comparisons
and the real Chromium eleven-case comparison; all passed, and Chromium still
had no Node globals. The new addon, browser entry and WASM SHA-256 values are
`fb7d03209078eef275673a8228b424063e9f714dcdb394eb016b1c846c12b2b6`,
`e4f185e98e299142fe6b7c5b013fc2857bea8e627c3f876b0f6d6cae0bd489cc`,
and `123dc08f6e8ab36301812d990931b81c58b90aaf992600c46de51ccfb3c48795`.

This closes generated-input drift for the captured relationship-route cohort.
The manifest still labels the artifact private and nonpublishable; the 922-gap
retirement ledger, `./reference`, broader package gates and Python hosted
release matrix remain open. Future source changes require new qualification.
