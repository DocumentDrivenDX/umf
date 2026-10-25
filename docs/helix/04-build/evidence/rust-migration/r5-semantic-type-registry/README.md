---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-type-registry
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 data-only semantic type registry

This opt-in Rust slice adds caller-owned `SemanticTypeRegistry::register` and
`lookup` to the already integrated semantic-types module. It preserves exact
vocabulary/version/term keying, duplicate rejection, object-only JSON
definitions, unknown registration qualifier refusal, and copy isolation. It
does not invoke callbacks, load remote definitions, expose binding/wire routes,
or change default routes.

The predecessor packet records current TypeScript outcomes for malformed
references and definitions, unknown registration qualifiers, duplicate and
distinct triples, caller/lookup mutation isolation, and astral plus lone
surrogate UTF-16 definition strings. The freezer pins the direct registry
implementation and its JSON/type/error/package closure. Rust tests compare the
frozen errors and values, verify that lookup tolerates retained unknown
qualifiers on references (as TypeScript does), and exercise the same shared
`Context` meter, cancellation, and deadline hooks used by core operations.
Index comparison work is charged in proportion to retained registration key
units and the incoming key; JSON copy work and text units are charged by
`copy_json`.

Focused validation passed with the repository-pinned Rust 1.90.0 toolchain:

- `cargo test -p umf-core --test r5_core_semantic_types --offline`: 4 passed.
- `git diff --check` for the registry implementation, tests, freezer, and packet.
- TypeScript freezer: `bun scripts/rust-migration/r5/freeze-semantic-type-registry.ts` (Bun 1.4.3).

SHA-256 pins:

- Rust module: `619b113706ee501d3ceb1202ba914e5fcb7aaecfd1056eeb3ff1cbd9ad9d3285`
- focused Rust tests: `0c9bfe47ee9981fef16f5c5bba8111c314f5d7c9c78d1a175085b5cd1005b9ff`
- TypeScript freezer: `2e3b523595b94f98ddd8f6de2c583b76fd5edc95bc140c7e8924fff997330bd9`
- frozen predecessor packet: `a0c0b09efb29009316838b89274f70e65561bbf15fe4f86832288dc84b2ab6aa`

This evidence does not cover `validateSemanticTypeValue`,
`validateCoreSemanticTypeValue`, trusted callback transport/resource controls,
interim extension accessors, CONTRACT-078 upgrade/rollback transition APIs,
wire/binding routes, or default route/cutover behavior. These remain open for
separate implementation and review.

Independent Sol review compared the final `register`/`lookup` control flow
against `src/extensions/semantic-types/index.ts`, checked the five frozen
predecessor source hashes, and reran the final focused Rust suite (4/4). The
repository typecheck passed after a TypeScript-only assertion on the freezer's
mutation fixture; the frozen predecessor outcome did not change. The
review checked definition-copy-before-duplicate refusal, retained unknown
lookup qualifiers, exact UTF-16 triple keys, isolation of caller and lookup
values, and caller `Context` control propagation. No P1/P2 remains in this
data-only registry slice. It makes no claim for callback execution or an
installed host route.
