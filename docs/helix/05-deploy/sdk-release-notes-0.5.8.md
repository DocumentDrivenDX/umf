---
ddx:
  id: umf.sdk-release-notes-0.5.8
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: TD-085
      kind: informed_by
    - id: STP-085
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
---
# UMF SDK 0.5.8

## Release Scope

The locally qualified software development kit (SDK) 0.5.8 supports changing the native default for one existing stored field. A reviewed migration can set, replace, or remove that default for future writes that omit the field. Existing rows remain unchanged, and explicit NULL, explicit values, and omission keep distinct meanings. Logical default resolution remains separate; validation does not fill data. A native default does not make a declared command input optional.

The selected dependency tuple is Access 0.1.0.dev8, Codegen 0.1.0a5, `umf-core` distribution 0.10.3 with semantic Core 0.10.0, and Weft 0.4.56. The selected final18 Python cohort requires glibc 2.34. The selected ordinary Weft module 0.2 source-admission slice accepts matching, non-null, missing-only logical/native defaults for boolean, string, integer, exact decimal, UUID, and bits128 carriers, subject to existing domain, facet, and native matching checks. Logical temporal defaults remain unsupported. Native-only date, current-timestamp, and random-UUID defaults retain their separate qualified semantics and do not widen logical-default admission.

## Audience and Channels

| Audience | Why they care | Delivery channel |
| --- | --- | --- |
| SDK consumers | Change the future behavior of an omitted field on a selected existing table. | Version-specific notes and schema migration guide |
| Migration operators | Select the host profile and approve the source-bound change. | Migration plan and host migration records |
| Support teams | Match questions to the exact package tuple and qualified platform. | Qualification evidence linked below |

## Highlights

- The migration changes one existing field's future native default without rewriting stored rows.
- A trusted host explicitly selects the qualified table-operation module profile; ordinary operations keep their established default profile otherwise.
- Local evidence covers the exact SDK archive, installed consumer, selected Python cohort, and installed-SDK browser path shown below.

## Required Actions Summary

- Users: ordinary operations retain table-operation module 0.1 unless the trusted host selects module 0.2.
- Operators: admit ordinary sources separately and select Weft module 0.2 through trusted host policy for supported retained-source reads, queries, writes, and outcome observation or recovery; select and approve any G03 migration plan separately.
- Support: describe this exact dependency tuple and platform evidence when explaining support.

## Changes and Fixes

### New or Improved

| Area | What changed | Who is affected |
| --- | --- | --- |
| Existing-field future default | Set, replace, or remove one native default for future omitted writes; stored rows remain unchanged. | Migration operators and SDK consumers |
| Trusted operation profile | Explicit host selection enables the qualified table-operation module 0.2 path. | Hosts that use the selected G03 behavior |

The SDK distribution tuple is distinct from its protocol versions:

| Identity | Selected value | Meaning |
| --- | --- | --- |
| SDK | 0.5.8 | Locally qualified package build |
| Access | 0.1.0.dev8 | Selected Python package |
| Codegen | 0.1.0a5 | Selected code generator package |
| `umf-core` | Distribution 0.10.3; semantic Core 0.10.0 | Package and semantic identities stay distinct |
| Weft | 0.4.56 | Selected operation and migration dependency |

The trusted host's `SessionPolicy.table_operation_module_profile` defaults to `weft.table-operation-module/0.1`; the host may explicitly select `/0.2` for supported ordinary reads, queries, writes, and outcome observation or recovery. This trusted source-admission setting is not an installation or request selector. Ordinary UMF declarations and ASTs remain 0.1. The typed G02 next-source UPDATE selection is UMF operation version 0.2; the Weft ordinary-operation envelope is separately version 0.2. G03 discovery is 0.2, options and plan are 0.5, execution is 0.4, approval is 0.1, and installation is 0.3. Python `options=None` omits the selector; a raw request with `options: null` is refused.

## Qualification

| Evidence | Result and scope | Record |
| --- | --- | --- |
| SDK producer actual002 | Standard Linux build and one 139-case installed consumer passed review. Archive: 30,834,843 bytes, SHA-256 `2aaf24741aee1c135fade5b7631db90d710e6211977fb9ca7fcc080ea7fdf58d`. | [Build checkpoint](../04-build/evidence/schema-migration-design-review/g03-sdk058-local-build-001/README.md), [independent actual review](../04-build/evidence/schema-migration-design-review/g03-sdk058-local-build-001/checkpoint/g03-sdk058-producer-actual002-sol-review001.md) |
| Paired parity019 | Fresh final18 Python installation, RECORD and generic checks passed on Linux x86_64, CPython 3.11.17, Ubuntu 24.04, glibc 2.39. Installed SDK browser parity passed with Chromium 153.0.8010.12, Bun 1.4.3, and Playwright 1.63.0 in 112.565 seconds. The raw-wire selector case came from embedded Python. The parity report sets `nativeLifecycleReleaseQualified=false`. | [Parity checkpoint](../04-build/evidence/schema-migration-design-review/g03-sdk058-local-parity-001/README.md), [independent actual review](../04-build/evidence/schema-migration-design-review/g03-sdk058-local-parity-001/checkpoint/evidence/reviews/parity019-actual-review.md) |
| Selected native subset | Original native attempt007 remains `FAIL_OR_UNKNOWN` across 19 PostgreSQL 18.6 scenarios. Separate reanalysis006 accepts 14 predicates over those observations and eight pure mutation controls; it ran no database. N12 contains 71 checks. This conjunction covers the selected Linux CPython 3.11.17/PostgreSQL 18.6 subset. | [Native checkpoint and original receipt](../04-build/evidence/schema-migration-design-review/g03-final-056-local-qualification-001/README.md), [reanalysis review](../04-build/evidence/schema-migration-design-review/g03-final-056-local-qualification-001/reviews/native-reanalysis006-actual.md) |
| Weft module 0.2 admission | The reviewed source admits the six listed matching carrier families and keeps ordinary UMF declarations at 0.1. This is source/build/probe evidence for module admission, not another runtime campaign. | [Module 0.2 checkpoint](../04-build/evidence/schema-migration-design-review/g03-module02-local-linux-001/README.md) |
| Inherited boundaries | Table012 and Truss011 have their own accepted Linux native, WASM, and browser boundaries. Their results retain separate provenance. | [Table012 checkpoint](../04-build/evidence/schema-migration-design-review/g03-inherited-local-lanes-001/README.md), [Truss011 checkpoint](../04-build/evidence/schema-migration-design-review/g03-truss011-local-boundary-001/README.md) |

## Breaking Changes and Required Actions

The selected ordinary-operation profile is set by trusted host policy: Weft module 0.1 remains the default, and the host explicitly selects module 0.2 for the supported retained-source operations. Request content cannot select it. G03 migration discovery/options/plan selection and approval are separate steps; ordinary UMF declarations remain 0.1. The SDK does not infer support for other field changes, unknown qualifiers, or combined migrations from this selected path.

| Change | Impact | Required action | Deadline or trigger |
| --- | --- | --- | --- |
| Select Weft ordinary-operation module 0.2 | Enables the qualified retained-source behavior for supported reads, queries, writes, and outcome observation/recovery. | Set `SessionPolicy.table_operation_module_profile` in trusted host policy; separately select and approve any G03 migration through its versioned discovery/options/plan path. | Before using module 0.2 ordinary operations |

## Migration or Rollback Guidance

### Upgrade or Migration

Use the existing discovery and options path to select the field and prepare the complete source-bound plan. The trusted host reviews and approves the plan, fences writers, and executes the qualified transaction. Authenticated recovery resolves an uncertain commit.

### Rollback or Hold Guidance

A later reviewed change can restore or remove the future default, but cannot undo row values written while it was active. After an uncertain commit, authenticate progress and the postcondition before any redispatch. Never redispatch a committed phase. A phase known to have aborted may be retried only after revalidation.

## Known Issues and Support

| Issue | Who is affected | Workaround or next step |
| --- | --- | --- |
| The complete 18-package cohort requires glibc 2.34, although individual Linux Weft wheels carry a manylinux2_17 tag. | Linux operators selecting the full cohort | Check the complete cohort requirement, not a wheel tag alone. |
| Python qualification ran on an emulated Linux x86_64 guest; the Chromium guest was Linux arm64. | Operators comparing runtime platforms | Use the recorded platform for each evidence row. |
| Weft aarch64 and macOS-arm64 results are build/static-only. macOS runtime, import, native, and browser behavior remain unqualified; GitHub Actions and macOS CI are off. | aarch64 and macOS users | Limit support claims to the recorded Linux subset. |
| Broader G03 lifecycle, managed adoption, other backends, and Praxis integration are outside this qualification. | Consumers of those paths | Use their own accepted evidence and governing contracts. |

## References

- [Schema migration plan and current delivery account](../04-build/schema-migration-plan.md)
- [Existing-column default contract](../02-design/contracts/CONTRACT-081-table-lifecycle.md#g03-existing-column-future-default-successor)
- [Schema migration design](../02-design/solution-designs/SD-007-schema-migrations.md)
- [Typed-action integration design](../02-design/technical-designs/TD-085-typed-actions-on-raw-tables.md)
- [Typed-action test plan](../03-test/test-plans/STP-085-typed-actions-on-raw-tables.md)
- [Installed SDK browser adapter](../../../scripts/g03-sdk-browser.ts)
- [Prior SDK 0.5.7 notes](sdk-release-notes-0.5.7.md)
