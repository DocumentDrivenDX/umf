---
ddx:
  id: umf.release.0.10.11
  type: release-notes
  activity: deploy
  authoring:
    home: repo
  links:
    - id: ADR-006
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: references
---

# UMF 0.10.11

## Release scope

The Rust library, CLI, SDK, and Python Core and Codegen packages share version
0.10.11. The document and core schema version remains 0.10.0.

## Highlights

- Rust owns Lakeview dashboard projection, bulk action coordination, and the
  remaining public SDK semantics. The browser uses the same Rust code through
  WebAssembly. TypeScript provides host wrappers and explicit compiler interop.
- The pack generator produces SQL DDL, ORM models, and CRUD actions from
  supported pack inputs. Keyless tables report the missing key and retain DDL.
- Smithy preserves exact numeric tokens and refuses native assembly or export
  when an unknown dependency descriptor member would be lost.

## Upgrade and distribution

Use the Rust source, CLI, and SDK assets for the matching platform from the
[0.10.11 GitHub release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.10.11).
Install Core and Codegen together when using Python code generation. The
Codegen package pins `umf-core==0.10.11`.

Local parity checks and the package verification scope are recorded in the
[Rust migration plan](../04-build/rust-migration-plan.md).
