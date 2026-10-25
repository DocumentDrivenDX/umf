---
ddx:
  id: umf.evidence.rust-migration.r8-python-sdist-rust-resource-closure
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Python sdist Rust resource closure

The Rust Record Type core unconditionally embeds
`spec/core/record-type-operation-v6.schema.json`. The prior Python source
archive inventory omitted this direct compiler input. The existing
`include_str!` closure test also found five other newly reached files under
`spec/extensions/delta-log/`, `security-v0.2/` and
`security-protection/`. The source-archive hook, exact inventory/verifier and
Hatch force-include declarations now carry those direct inputs. The adjacent
Delta, Protobuf and Core Evolution resource entries are also included in the
current exact source inventory. The wheel does not install these schemas as
runtime files; Rust embeds their bytes while compiling from the source archive.

The later opt-in Avro Record Type resolution foundation added an unconditional
`include_str!` of `spec/core/avro-record-type-classification.schema.json`.
The Hatch source inventory, force-include map, extracted-archive verifier and
their test authority now include that direct compiler input. Sol reran the
focused source-archive suite after this addition: 12/12 passed. The earlier
archive hash below predates this addition and must be recaptured at the next
fixed point.

Sol inspected the inventory/force-include changes and independently ran
`python/.venv/bin/python -m pytest -p no:cacheprovider -q
python/tests/test_python_sdist.py`: 12 tests passed, including the Rust literal
`include_str!` closure scan, canonical inventory and mutation refusal checks.
`git diff --check` passed. The scan covers literal compile-time includes in
production Rust source trees; this does not prove a built archive.

The action resource mirror was refreshed from current canonical `spec/`
resources. Hatch then built the local `umf_core-0.11.0.tar.gz` source archive
with SHA-256
`ee0e5a8a22d2d1ce10b9da64ffca5f7df17a3f8e946e9f98d0f9cd11634fba61`.
At that captured source checkpoint, Sol extracted it and ran
`verify_sdist_inputs` against the worktree: all 872 files matched
byte-for-byte, with canonical inventory SHA-256
`3b5ff8dbeb14092d8cf91eab77f57b3567207b397558796e92720c57a94b0cfa`.
From the extracted archive, offline `cargo check --locked -p umf-cli` passed
with Rust 1.90.0. The archive predates subsequent Python mirror and Avro
candidate edits, so it must be rebuilt from a final source cohort. This is a
local macOS arm64 source closure check; the
coordinated six-cohort hosted wheel/sdist matrix is still required.
The v6 operation schema's authoring authority remains unresolved in the R8
resource ledger; packaging it does not resolve that authority.

After the Avro and WASM source cohort settled, Sol regenerated the metamodel
and both Python resource mirrors and rebuilt local source archives.
`umf_core-0.11.0.tar.gz` has SHA-256
`2cf97389f50d3f54677c0e5bfb4e19578e48afec061b48e09837f295b4b42d69`;
`umf_codegen-0.2.0.tar.gz` has SHA-256
`5774817fb5ab72e280bb25c02789566275bc7995ab46dfc68cec4be354be658d`.
The extracted core archive matched 874 reviewed checkout files byte-for-byte,
with canonical inventory SHA-256
`571da36b4659ea03c213f782b141a1b9ce91a9670405ba11ed13276053ee238d`.
Offline `cargo check --locked -p umf-cli` passed from that extracted source.
The core archive now contains the Avro classification schema. These two
archives preceded the later pinned-tool four-artifact local pair, whose
[core and pair receipts](r8-release-pair-readiness/README.md) pass the local
wheel/install verifier on macOS arm64/Python 3.13.16. Neither local cohort is
one of the six revision/run-bound hosted cohorts; no release claim follows.

The subsequent opt-in Parquet Record Type candidate unconditionally embeds
`spec/core/parquet-record-type-classification.schema.json`. The source archive
inventory, Hatch force-include, extracted-archive verifier and focused sdist
test authority now include it. The Avro Field classifier additionally embeds
`spec/core/avro-field-classification.schema.json`; the same four source-archive
authorities include that input. Sol independently reran the focused sdist suite
after both additions: 12/12 passed. Both local pairs above predate these new
compiler inputs and cannot qualify the current source tree; a fresh archive
and pair are required after the remaining Rust source work settles.

The next Record classifier layer embeds two additional direct compiler inputs:
`spec/core/avro-record-classification.schema.json` and
`spec/core/parquet-record-classification.schema.json`. The Hatch inventory and
force-include map, extracted-archive verifier, and exact sdist test authority
now include both. Sol reran the focused sdist suite after this change: 12/12
passed. The earlier local archive and wheel pair predate these additions and
must be rebuilt from the eventual final source cohort. This scoped source
inventory check does not establish the six-cohort release matrix.

The opt-in Record Type wire binding also embeds
`spec/extensions/parquet/package.json` when it initializes the Parquet
registry. The focused source-archive test initially failed because this
manifest was absent from the explicit Hatch, verifier and test inventories.
Sol added the manifest to all three authorities and updated the pinned
`_python_sdist.py` verifier hash in its two consumers. The focused sdist
closure suite then passed 12/12; the separate artifact-custody tests passed
4/4. These checks prove the declared compiler-input closure at this source
checkpoint. They do not replace a fresh source archive rebuild or the hosted
release matrix.
