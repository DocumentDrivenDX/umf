---
ddx:
  id: umf.evidence.rust-migration.r8-python-cli-closure-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-python-cli-closure
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: Python and CLI source routes

Sol checked the seven `_CLI_OPERATIONS` in
`python/umf_codegen/src/umf_codegen/_native.py` against the public codegen
module and confirmed that `_cli_binary` resolves only the packaged
`umf/_bin/umf` executable and rejects non-POSIX hosts. This supports the
source-route claim that this compiler path no longer executes V8; it does not
qualify an installed wheel. Public `umf-core` and `umf_access` surfaces still
contain Python behavior, while the Node/browser V4 roots inherit executable
TypeScript exports.

Sol also checked the six CPython/platform entries in
`.github/workflows/python-coordinated-release.yml`, the two native SDK hosts
in `.github/workflows/rust-sdk-default-qualification.yml`, and the deliberate
failing job in `.github/workflows/pypi.yml`. Those files support the audit's
conclusion: no current same-run six-cohort Python aggregate or publishable SDK
artifact is established. This review accepts the audit as a moving-source
route inventory and keeps archive, installed-host, complete-port, and release
claims open.
