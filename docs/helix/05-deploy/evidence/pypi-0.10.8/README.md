# Core 0.10.8 public release proof

`umf-core==0.10.8` is public on [PyPI](https://pypi.org/project/umf-core/0.10.8/).
The coupled [GitHub release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.10.8)
contains exactly 21 assets. Anonymous downloads matched all 21 GitHub asset
hashes and all three PyPI archive hashes. Semantic Core remains `0.10.0`.
The [release guide](../../core-codegen-release-notes-0.10.8.md) explains matching
Core/Codegen installation and the separate Codegen publication phase.

## Source and controller identities

| Identity | Exact commit | Meaning |
| --- | --- | --- |
| Production S / product tag | `e3f38ef6f05ae636d2837f9d69f8d6805222664b` | Actual package, resource and full source-archive source |
| Historical assembly controller | `3c341214357d714320540a76e2efd34400fca36d` | Frozen `source-manifest.json` assembly record; not the final controller |
| Final qualification Q | `08c9f7c86efba716f1b65dbd5938661ddd6ac19c` | Reviewed qualification controllers; no replacement production source |
| Publisher/main R | `1c37dfcb588c7167cfcb5a4b3d730ffa61375b08` | Main-only publisher and fresh-public proof controller |

Main R's tree is `705d9946a1feb099f44dd1bb567dc61322e476fe`; production S's
tree is `a21368a92df488882ef9771e4a1d92205267ddd3`.
[verification.json](verification.json) records complete asset IDs, sizes, SHA-256
digests, original Actions provenance and exact-type consumer assertions.

## Original Actions provenance

Release-event dispatcher [41676753751](https://github.com/DocumentDrivenDX/umf/actions/runs/41676753751)
ran for `umf-v0.10.8` at S, actor `easel`. It dispatched the existing main-only
publisher [41677339110](https://github.com/DocumentDrivenDX/umf/actions/runs/41677339110),
attempt 1, event `workflow_dispatch`, actor/triggering actor `github-actions[bot]`,
controller R and ref `refs/heads/main`. The dispatcher omitted `locally_qualified`;
the workflow default and observed effective value were **false**. Publisher tests,
public source verification and the installed consumer all ran successfully.

| Original publisher job | Job ID | Original artifact ID | Retained receipt scope |
| --- | --- | --- | --- |
| `verify-release` | `126061406641` | `13250204849` | Exact three Core archives, source receipt and independent public source check |
| `publish` | `126064021517` | `13251098122` | Exactly `publication-receipt.json` and `source-receipt.json` |
| `installed-consumer` | `126067217675` | `13252581348` | Exactly `consumer-receipt.json` |
| `installed-consumer` diagnostics | `126067217675` | `13252646370` | Install report, native proof, log, installed inventory and control identity |

The publisher used PyPI trusted-publisher OpenID Connect (OIDC). Its source,
publication and consumer schemas remain `pypi-release-source.v1`,
`pypi-publication-receipt.v1` and `pypi-consumer-receipt.v1`.
The consumer contains the original `nativeResourceInspection` child with profile
`umf.fresh-public-core-correspondence/1`; no old shallow receipt was upgraded.
ZIP digests, complete member digests, workflow hashes, job times and the original
log line proving `LOCALLY_QUALIFIED: false` are in `verification.json`.

## Actual verification and boundaries

The independent public-download source check verified all **70,549 tracked
members**, exact Git blob bytes, producer-policy modes/types, symlink targets,
prefix/PAX identity, full archive size/digest and Git roster. The unchanged
[source-archive receipt](source-archive.json) records the result without extraction.

The [original consumer](consumer-receipt.json) used normal public-index dependency
resolution and `pip check` on Linux x86_64 CPython **3.11.17**, with Pydantic
**2.14.2**. The actual loaded native extension, complete installed wheel records
and canonical resources matched before and after **17 inspection cases / 51
calls**. Request custody, semantic/protocol identities and all 18 Codegen-required
consumer fields passed exact-type checks.

The unchanged [source](source-receipt.json) and [publication](publication-receipt.json)
receipts bind the three public Core archives. Their bytes and the consumer/source
receipts are copied verbatim from the authenticated original artifacts.
No ZIP, wheel or source archive is committed here. Later receipts remain separate
from the frozen GitHub assets and checksum roster.

Original direct/rebuilt Linux 3.11/3.13, Mac 3.11.17 component, wheel-embedded CLI19
on each platform, SDK and browser proofs retain their own identities in the
published `qualification.json`. This public consumer proves Linux 3.11 only.
It does not establish fresh-public macOS, Mac 3.13-native, Access/Codegen PyPI,
Weft or Truss qualification. Stale 0.10.7 README references inside the immutable
production artifacts remain the release guide's explicit documentation limitation.
