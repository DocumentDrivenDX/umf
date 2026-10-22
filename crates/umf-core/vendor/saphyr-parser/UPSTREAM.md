# Vendored saphyr-parser

This directory vendors `saphyr-parser` 0.1.0 from crates.io (upstream repository `https://github.com/saphyr-rs/saphyr`, registry checksum `7429158804c36e705d9423b7848018e535b3e92d439a763e364ee12670ef473b`). The pristine registry `Cargo.toml` is retained as `Cargo.toml.upstream`; `Cargo.toml.orig` is the upstream original manifest. The active manifest lists only the production library dependencies and disables automatic upstream executable test, benchmark and example discovery, so their separate development tools do not enter UMF's offline build graph. The library remains an ordinary path dependency/workspace member; its five self-contained library unit tests remain enabled.

The upstream source hashes for the files touched by the compatibility patch are recorded in `docs/helix/04-build/evidence/rust-migration/r2/sol-yaml-parser-profile-decision.json`. Upstream license text and the four referenced license files are retained unchanged in `LICENSE` and `.licenses/`.

## UMF patch

The patch adds an immutable `ScanProfile` selected by trusted Rust code and passed through the same parser, scanner, and input implementation. Existing constructors and `ScanProfile::Yaml12` preserve upstream defaults. `PythonRuamel12` makes NEL, LS, and PS break delimiters in shared input predicates and scanner tokenization, advances the scanner column as ruamel's reader does, maps NEL to LF in scalar breaks, and preserves LS/PS in scalar output. It also tracks a trailing special break so block-scalar EOF handling does not synthesize an extra terminator after a break that has already supplied the scalar newline. The optimized string and buffered input paths use the same profile predicates. No source normalization, token insertion, or independent YAML grammar is used.
