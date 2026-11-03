---
ddx:
  id: umf.core-codegen-release-notes-0.10.8
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-067
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Core and Codegen 0.10.8

## Release Scope

Core 0.10.8 is published on PyPI, with exact public-byte and fresh-public Linux
native/resource/inspection verification. The [public proof](evidence/pypi-0.10.8/README.md)
records the original Actions receipts and scopes. Codegen PyPI publication is a
separate step.

The exact production source is
[`e3f38ef6f05ae636d2837f9d69f8d6805222664b`](https://github.com/DocumentDrivenDX/umf/commit/e3f38ef6f05ae636d2837f9d69f8d6805222664b).
The published coupled GitHub release is `umf-v0.10.8`. Its source archive and
package bytes retain that source when documentation and qualification
controllers subsequently merge into main.

`umf-core==0.10.8` and `umf-codegen==0.10.8` are distribution versions. Semantic
Core remains `0.10.0`; the action and saga vocabulary versions remain `0.1.0`.
Codegen 0.10.8 requires **exactly `umf-core==0.10.8`**. It does not declare
compatibility with the 0.10.7 distribution.

## Audience and Channels

| Consumer | Material | Delivery and current phase |
| --- | --- | --- |
| Python Core users | Native Core wheels and source distribution | Published on PyPI; fresh-public Linux 3.11 native/resource/inspection proof passed |
| Python Codegen users | Pure Python companion wheel and source distribution | Public in the coupled GitHub release; Codegen PyPI publication retains its separate gate |
| JavaScript SDK users | Retained coupled SDK archive | Public GitHub delivery; installed Linux SDK and browser proofs retain their original scopes |
| Source consumers | Complete production-source archive | Public at the exact source above; full archive correspondence passed; controllers are separately identified |

GitHub asset delivery, Core PyPI publication and Codegen PyPI publication are
separate steps. A GitHub release containing the companion wheel does not mean
that `pip install umf-codegen==0.10.8` can already resolve it from PyPI.

## Highlights

The public access-view inspector exposes the existing shared Rust inspection
semantics through the engine dispatcher and language bindings. Inspection keeps
source custody, diagnostics and resource controls. Source identifiers must be
valid UTF-8; invalid surrogate identifiers are refused rather than coerced.
Document content retains its existing lossless transport behavior.

The coherent native cohort also preserves the reviewed completed-resource cache
publication, saga diagnostic isolation and UPDATE-grant repairs. This release
does not establish Weft/Truss native enrollment, migration or temporal-composition
qualification; those consumers retain their separately governed gates.

## Required Actions Summary

Install matching Core and Codegen distribution versions. Use the phase-specific
commands below only after the indicated public availability checks pass. Keep
normal dependency resolution enabled and run `pip check`.

## Changes and Fixes

| Area | Behavior and evidence boundary |
| --- | --- |
| Public inspection | Shared engine dispatcher and Python convenience API preserve ordered results, bindings, diagnostics and request custody; installed Python corpus covers 17 cases and 51 calls |
| Native packaging | Selected Linux and macOS wheels retain the complete native extension and embedded CLI; independently qualified embedded CLI19 results are tied to each platform's own binary hash |
| Qualification | Direct Linux 3.11/3.13, source-rebuilt Linux 3.11/3.13, installed Mac 3.11 component, SDK and browser receipts keep their distinct sources, controllers and artifact identities |
| Companion resources | Codegen protocol `umf-codegen-r3-seven-ops-nine-resources/1`, CLI protocol `umf.codegen-cli/1` and exact resource-manifest pins remain coupled to Core 0.10.8 |

## Breaking Changes and Required Actions

Codegen's exact Core dependency requires the matching pair. Do not retain
`umf-core==0.10.7` when selecting `umf-codegen==0.10.8`. This does not change the
independent semantic Core identity or reinterpret document content.

## Migration or Rollback Guidance

### After Core's public PyPI bytes and fresh consumer are verified

```sh
python -m pip install --index-url https://pypi.org/simple 'umf-core==0.10.8'
python -m pip check
```

### After the coupled GitHub companion assets are public, while Codegen PyPI is pending

Download the exact wheel and `SHA256SUMS` from `umf-v0.10.8`, verify the wheel's
SHA-256 against that manifest, then install with normal dependency resolution:

```sh
gh release download umf-v0.10.8 --repo DocumentDrivenDX/umf \
  --pattern 'umf_codegen-0.10.8-py3-none-any.whl' --pattern SHA256SUMS
python -m pip install --index-url https://pypi.org/simple \
  ./umf_codegen-0.10.8-py3-none-any.whl
python -m pip check
```

The retained companion wheel SHA-256 is
`0d21acef3171442b818a4ad1dfdbaf99cc0f0f5557e5c670d5ce56243235dbc5`.
This path proves GitHub companion delivery, not Codegen PyPI publication.

### After both exact PyPI distributions are public and verified

```sh
python -m pip install --index-url https://pypi.org/simple 'umf-codegen==0.10.8'
python -m pip check
umf-codegen --help
```

The normal resolver selects `umf-core==0.10.8` through Codegen's exact package
dependency. No dependency suppression or private fallback wheelhouse is used.

For rollback, use an independently qualified prior matching tuple in a separate
environment. Do not mix a prior Core wheel with the 0.10.8 companion or relabel
retained qualification evidence.

## Known Issues and Support

The immutable production archive's
[`python/umf_codegen/README.md`](https://github.com/DocumentDrivenDX/umf/blob/e3f38ef6f05ae636d2837f9d69f8d6805222664b/python/umf_codegen/README.md)
still contains 0.10.7 version references. Those references are stale
documentation, not evidence of 0.10.7 runtime compatibility. The actual 0.10.8
package metadata and generated release/resource constants govern this cohort.
Use the matching commands in this current guide. The archived README and source
artifacts remain unchanged; no replacement production source or rebuild follows
from this correction.

The [publication receipts and fresh-public native/resource/inspection proof](evidence/pypi-0.10.8/README.md)
were produced **after** the immutable GitHub assets were published. They remain
separate authenticated Actions artifacts, with their actual run,
controller, member and file hashes. They are not later added to or substituted
into the frozen release assets, source manifest or checksum roster.

## References

- [Public inspection contract](../02-design/contracts/CONTRACT-067-access-sdk-generator.md#public-access-view-inspection).
- [Production release metadata](https://github.com/DocumentDrivenDX/umf/blob/e3f38ef6f05ae636d2837f9d69f8d6805222664b/spec/release.json).
- [Codegen dependency metadata](https://github.com/DocumentDrivenDX/umf/blob/e3f38ef6f05ae636d2837f9d69f8d6805222664b/python/umf_codegen/pyproject.toml).
- [Linux consumers and no-JavaScript rebuild](https://github.com/DocumentDrivenDX/umf/actions/runs/41626678514).
- [Original Linux embedded CLI19](https://github.com/DocumentDrivenDX/umf/actions/runs/41651139875), with its separate Mac setup failure retained.
- [Missing-only Mac embedded CLI19](https://github.com/DocumentDrivenDX/umf/actions/runs/41654751832).
