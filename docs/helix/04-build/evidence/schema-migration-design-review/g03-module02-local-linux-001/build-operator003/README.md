# G03 focused compiler integration and held Linux build

This frozen operator is for root execution. It runs the entire table-operation
integration target and builds a held Python wheel only if that target passes.
It does not qualify the broader Rust suite or G03. Attempt002 remains failed;
its invalid required-output query fixture is repaired without changing compiler
nullability or source-admission rules.

Source is the isolated Weft worktree based on e7e88b077c256c852a83d7951e3bc5fd1ec234aa.
Exact semantic, candidate-metadata and complete patch fingerprints are in the
operator manifest and checked again before/after execution. The held version
0.4.55+g03.a96e4f29262e is the initial prototype label; it does not assert equality
between that label and the revised source hash. No earlier wheel exists at this
coordinate. Published Weft 0.4.55, its mirror and release assets remain unchanged.

The Linux amd64 builder is pinned by immutable image digest 1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10.
Source and operator inputs are read-only; owned Cargo cache/target resources are
separate. RUSTUP_TOOLCHAIN selects installed 1.90.0-x86_64-unknown-linux-gnu, with
actual Rust/Cargo/Python/CC identity checks. Only locked dependency acquisition
and the exact hash-pinned Maturin 1.9.6 wheel download may network. The driver
detaches networking before tests/build and verifies the detached state.

The test command is `cargo test --locked --offline -p weft-postgresql --test table_operation`.
The conditional build remains the complete pyproject-feature
`maturin build --release --locked --offline --interpreter <observed Python 3.11.17> --out <held output>`.
The full Rust release gate remains open and must pass before publication.

Limits remain 3600 seconds total, 60 terminal reserve, 10 termination grace;
setup<=600, tests<=1800, build<=1800, each clamped to remaining work time.
Resources are 4 CPUs/8 GiB/8192 PIDs/four Cargo jobs. Logs<=1MiB, metadata<=16MiB;
software wheel<=32MiB compressed/128MiB expanded with exact member hashes.
Any source/tool mismatch, failed command, timeout, truncation, capture or cleanup
failure prevents acceptance. No GitHub Actions, macOS execution, database effects,
push, merge or publication are performed.
