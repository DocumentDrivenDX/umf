---
ddx:
  id: umf.evidence.rust-migration.r8-macos-python-current-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R8 current local macOS Python artifacts

Built fresh `umf-core`, `umf-codegen`, and `umf_access` wheels and source
archives on macOS arm64 into
`/private/tmp/umf-r8-macos-python-current-20261027-103251`. Cargo ran offline
with Rust 1.90.0. The core wheel is CPython `abi3` (`cp311-abi3`, minimum
macOS 11.0); the pure Python wheels are `py3-none-any`.

| Artifact | SHA-256 |
|---|---|
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `19ee8cdc64c3b1007dae4a7bdf96cf1ca920146fe8f1d398cbd8df89da77b558` |
| `umf_core-0.11.0.tar.gz` | `d614e1f31dae005178aa42515cf6e519467f10a3bd38aed666015506e0f38ae7` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `8a40e5ea2a24c074ac56c5ba1179a831fffa536fd8207677515ae619a4102d52` |
| `umf_codegen-0.2.0.tar.gz` | `b2c00665b86cc7368d5c8c0b18a66fa8ab41383986920c23639e3f61a4e27d` |
| `umf_access-0.1.0.dev7-py3-none-any.whl` | `4eb5882cef3907110af5526240774234dd0da60d3e2fb51c961ad5dae3896e76` |
| `umf_access-0.1.0.dev7.tar.gz` | `2991f1414b5878966dd9358bef4750cf0b953066c3c1b7f2306bdf0b4d8dcbfe` |

The core artifact verifier passed source payload verification for 52 package
files and checked all nine action runtime resources against their manifest. Its
extracted-sdist rebuild retained version, tag, metadata, and non-native package
payload identity. The direct and rebuilt Mach-O files differ bytewise: the
CLI hashes are `fd42acd7fc98656b08238c28ee93a819700a88181f04bd0ddc9e337d971a1491`
and `fed9d73c27f05beb6e3fec360013280b4a69142c5290583bf61a5e28f1ba88`; the
PyO3 hashes are `197c89b74e5bf595f66db0e25a4b58e598ededc37abd9297e3f2b425b636091c`
and `23b478442d4d092385e55ad5f51e977a7c2af6a396c75a01216f6bd90c8bf0f5`.
The verifier reports `native_byte_identity=false`; this packet preserves that
result and makes no native-byte reproducibility claim.

The codegen sdist mirrors 24 current source inputs (closure SHA-256
`2a11d689165dfe75868abff0c274f26adf58522de44f76e5459bacb670027013`), and
its nine canonical resources match manifest
`9a4a3d96f4e953e75098dcfe2ab8518d8b9a5f94c2bcea8e213801127841d4ff`. Its
wheel rebuilt from the extracted sdist matches the direct wheel SHA exactly.
The `umf_access` wheel and sdist match across 94 package files (closure SHA-256
`d9b4650cb1110c81a62a2b250f1e29eec11f1ebe63d0bccc703a3222c8795521`), and
its extracted-sdist rebuild is also an exact wheel SHA match.

An offline fresh CPython 3.14.8 environment installed these wheels. Imports
resolved from that environment; the installed PyO3 binding returned profile
`umf-operation-count-result-frame/0.1.0` and composed the exact integer token
`9007199254740993`. The installed codegen CLI help and a generation request
passed; generation returned seven files. Four focused access test modules
passed against the installed packages: 26 tests and 33 subtests.

The test command was:

```sh
PYTHONPATH=/private/tmp/umf-r8-macos-python-current-20261027-103251/installed-venv-314/lib/python3.14/site-packages:\
/Users/erik/.codex/worktrees/rust-binding-spike/umf/python/.venv/lib/python3.13/site-packages \
  /opt/homebrew/bin/python3.14 -m pytest -q -p no:cacheprovider \
  python/umf_access/tests/test_rust_count_result_frame.py \
  python/umf_access/tests/test_rust_count_token.py \
  python/umf_access/tests/test_operation_values_rust.py \
  python/umf_access/tests/test_rust_read_frame.py
```

The captured verifier output and source/resource hash maps are in
[`artifact-evidence.json`](artifact-evidence.json); the complete core packaging
receipt is in [`core-artifact-receipt.json`](core-artifact-receipt.json).
Their SHA-256 values are respectively `1ef4cd8ba239fdd75742700031d30b0e7c1c94523153f7d00d4af418cc51816a` and
`2462d60f0158b316f680046f71c490cf23f901f7d3c33ce833f52e8d24376ecc`.

This is one private local macOS arm64 cohort. No macOS CI ran. It does not
qualify the hosted Linux cohorts, CPython 3.11/3.12, the coordinated release
matrix, publication, or broader UMF support.
