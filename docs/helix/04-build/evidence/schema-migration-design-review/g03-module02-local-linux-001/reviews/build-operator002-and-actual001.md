# Weft local build attempt001 and operator002 closure

Disposition: preserve attempt001 FAIL_OR_UNKNOWN as a provisioning failure; ACCEPT SOURCE for root's corrected operator002 attempt. No dependencies, source tests or candidate build passed in attempt001.

Actual001 receipt SHA-256 a259dd279f3077e911ff2588f22c9639376be757183319afd84bf93cae6fea58 (6,900 bytes). Independently checked both physical setup log hashes/sizes: 192 bytes total, no truncation/capture/timeout. Setup exited 1 after 0.468 seconds, outer 2.56 seconds; no wheel or maturin provisioning exists. Exact reviewed source before/after is unchanged; owned cleanup completed in 1.305 seconds with no recorded error.

The log shows rustup synchronizing 1.90.0 then failing to create /opt/rustup/tmp on the read-only image. The source rust-toolchain.toml also requests wasm32 and rustfmt, neither of which is part of this native Linux test/build. This failure occurred before the requested compiler identity could be observed and before dependency/test/build commands. It is not a product/compiler test result.

Operator002 runner SHA 03cc9afa9d2f09ab191e5328c385d21e5abaae9971ce24ad0081ca6fc8d38c6a; verified all manifest payload rows, manifest SHA 5c5dec9b52d54bbc5b92be9589c0922d2163e217293e6a90ad6d4cbc6de4ba64. Executable delta from accepted001 consists solely of new output/operator metadata paths and explicit RUSTUP_TOOLCHAIN=1.90.0-x86_64-unknown-linux-gnu. It selects the already installed exact native compiler toolchain rather than allowing rustup's source-file component/target synchronization. Existing observed Rust/Cargo/Python enforcement, full source checks, commands/features, held version, network isolation, resource/time/evidence bounds and cleanup remain unchanged. No wasm/browser or formatting qualification is implied.

Prior source review 1450d8efdbc52b3157ecef01f912812283b66769e12297f78e707340df2791b9 otherwise carries forward. Root may execute the corrected bounded attempt, retain prior failure byte-exact and review actual test/build/artifact results afterward. Sol performed only text/data/hash inspection, not runtime, container, Git or Actions work.
