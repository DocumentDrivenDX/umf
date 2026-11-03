# Access and Codegen publisher refusals — 2026-11-03

Both original attempts reached PyPI and observed `invalid-publisher`: **valid
token, but no corresponding publisher (Publisher with matching claims was not
found)**. This records workflow-token matching failures. It establishes neither
project-specific upload denial nor successful project authorization. Existing
user release authority remains unchanged.

| Original attempt | Workflow/main commit | Failed job | Observed outcome |
| --- | --- | --- | --- |
| [Access41627480216, attempt1](https://github.com/DocumentDrivenDX/umf/actions/runs/41627480216) | `86c4c1fb8bf47b9ddf710c14d5ded024b3393286` | `125888412851` (`capability-only`) | HTTP **422**, `invalid-publisher`; `capability_only=true`, `publish=false` |
| [Codegen41682817644, attempt1](https://github.com/DocumentDrivenDX/umf/actions/runs/41682817644) | `2682524580e3bdd390d359f01f73677c08445826` | `126082919149` (`publish`) | `invalid-publisher`; numeric HTTP status **not exposed**, never inferred as422; `publish=true` |

## Original proof custody

[verification.json](verification.json) records the exact workflow paths and file
hashes, controller commits/trees, original run/job/attempt identities, complete
artifact member SHA-256 maps and observed service scopes. These metadata and
small artifact ZIPs were rechecked against authenticated original GitHub APIs;
no new probe was run. No ZIP, package archive or raw log is committed here.

Access passed exact local immutable repository/workflow/main/environment claim
checks before exchange. Artifact `13226737073`,
`access-capability-failure-41627480216-1`, has ZIP SHA-256
`37cb4c70533251bac188d2844f2b3e9058336226997cfe116c6123b906a9b195`.
Its sole [sanitized observation](access-capability-observation.json) is copied
byte-for-byte, SHA-256
`b05bd28d3af393cb32152122ebcfdaca88ae4a1a6fbe6fd5d12f902ff37b337e`.
Its package verify, publish and public-consumer jobs were skipped.

Codegen verifier job `126080648481` passed; publication preflight revalidated the
original package bytes and qualified public Core before the normal PyPI publisher
action failed. Artifact `13253506881`, `admitted-codegen-0108`, has ZIP SHA-256
`8d9a30326e1bc14a05d9debf51165908906b6fa873e82c2c7ee754857cd2e7d5`.
Its11 members are verified **inputs**, not publisher-success or fresh-consumer
proof. The failure reason is a sanitized original job-log observation; this run
emitted no failure-receipt artifact. Its public-byte step and consumer job
`126086594878` were skipped. Both checkout steps succeeded; no timeout or checkout
fix is claimed.

Neither attempt uploaded packages. Neither established Access/Codegen public
package-byte or fresh-consumer completion. The separate [Core0.10.8 public
proof](../pypi-0.10.8/README.md) retains its original qualified scope; Weft/Truss
work continues independently.

## Exact bindings and remaining gates

Both external configuration questions remain **PENDING**, with no user reply
recorded. No settings change, reprobe or upload follows from elapsed time.

| PyPI project scope | GitHub owner / repository | Workflow filename | Environment | Settings |
| --- | --- | --- | --- | --- |
| `umf-access` | `DocumentDrivenDX` / `umf` | `publish-access-pypi.yml` | `pypi` | [Access publishing](https://pypi.org/manage/project/umf-access/settings/publishing/) |
| `umf-codegen` | `DocumentDrivenDX` / `umf` | `publish-codegen-pypi.yml` | `pypi` | [Codegen publishing](https://pypi.org/manage/project/umf-codegen/settings/publishing/) |

The needed administration action is to verify/configure each exact GitHub Trusted
Publisher binding through an authenticated project mechanism. Project existence
and current settings are not inferred from these failures. If a project does not
exist, PyPI's [pending-publisher settings](https://pypi.org/manage/account/publishing/)
provide the corresponding project-scoped route. No alternate credentials or
local-upload bypass is selected.

Wait for a concrete configuration state change and review exact-main admission
before another authorized attempt. Access still requires its actual package/Core/
cohort gates. Codegen's reviewed admission and successful preflight remain recorded;
normal OIDC upload or exact-byte reuse, public readback and a fresh normal-resolver
consumer remain open. This packet changes no controller, admission, archive,
resource or qualification proof. [SHA256SUMS](SHA256SUMS) binds its three files.
