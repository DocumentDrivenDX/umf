# G03 P56 macOS build002 and static audit004 actual review

Disposition: ACCEPT the exact local macOS ARM64 build artifact plus its separate static-audit continuation. This is a build/static-only acceptance, not installed, imported, native-runtime, compiler, browser, hosted-CI, publication, or overall G03 qualification.

Reviewed by Sol using source text and independent stdlib JSON/hash/ZIP/CSV/Mach-O data inspection only. No candidate module, helper, test, compiler, build, Docker, network, or Git operation was executed by this review. The accepted operator004 source closure remains `/private/tmp/g03-macos-audit004-sol-source-closure001.md`, SHA-256 `226d46fa944cd657e0cb0a383f93f578b4517a1e6bd00371c68a6d3dacd9f208`.

## Exact accepted artifact and truthful history

- Original build002 result: `/private/tmp/g03-weft-macos-arm64-build-002/result.json`, 376450 bytes, SHA-256 `2aaa9dbe418cae86db3cac1f3c688a60d8b75746e31ec02badb1456941b663f0`. Its status remains `FAIL_OR_UNKNOWN`: the locked/offline aarch64-apple-darwin Maturin build exited 0 in 133.713 seconds; the original static helper exited 1 in 3.370 seconds because its MH_BUNDLE-only oracle refused this Rust cdylib. No old failure record was rewritten.
- Original wheel, unchanged: `/private/tmp/g03-weft-macos-arm64-build-002/dist/umf_weft-0.4.56-cp39-abi3-macosx_11_0_arm64.whl`, 11190603 bytes, SHA-256 `68f9297b4b55df483b86d3041040991c4dadfb9b4d63afcff1420c43f93ae41d`.
- Separate audit004 result: `/private/tmp/g03-weft-macos-arm64-audit-004/result.json`, 8051 bytes, SHA-256 `526cc38f854370f6bc34e044e9dc262b137bc1b4e95252c897578b5369c08fbf`, status `LOCAL_MACOS_STATIC_AUDIT_ONLY_PASS`.
- Audit004 report: `/private/tmp/g03-weft-macos-arm64-audit-004/static-audit.json`, 9604 bytes, SHA-256 `2a79490c17a4856823a9eb9ea8db5cb8cf342f4c961705e8e3fe5f22f9b96424`, status `STATIC_WHEEL_PASS`.

The original build002 logs, setup evidence, and all 30 bounded pre/post observations remain readable and match retained sizes/hashes. The build and static-stage captures are untruncated, have no capture errors or timeout, and retain 19579 raw bytes under the original 1 MiB bound. Source/tool/operator pre/post identities agree. The original result's null candidate and failed status must remain alongside the separately accepted audit004 result.

## Source and operator custody

P56 is commit `973d864c8d26b2bc173a411eac8368da5efc1ab3`, tree `8b20d1f01bea72ea08ed01fcaac97266ed3cb4ff`. All 1459 selected source rows (134880002 bytes) were independently rehashed physically, matching build002, audit004 pre/post summaries, and the canonical row asset SHA-256 `6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2`. The source custody and original trimmed Git-stage roster assets also match their fixed digests. This is the later explicit physical custody export bound to the original recorded roster, not a claim that the old receipt already contained the complete row asset.

Audit004 runner pre/post SHA-256 is `7657c0a79f34a67ddcdbe359ab1910a56642b1b95ee06af18881b77afbf3e4ce` (22917 bytes); helper SHA-256 is `ff38aded4a48b285a7c0c6f1bc02def7b24fcd7890dd896a440ea38ebf833fb6` (15878 bytes). The actual pinned CLT Python executable pre/post matches 53200 bytes / SHA-256 `6e7ae61f68a3838094fc56590f84c52069a97d7816f6bb79e0e85995b340e464`. Original result, original wheel, source custody assets, source files and operator identities remain stable.

## Physical archive and native data

The wheel has exactly nine unique regular members, 33467189 expanded bytes, and exactly nine matching RECORD rows including the empty self row. Every member size/hash matches audit004 and the earlier independent build002 inspection. Filename/WHEEL tag is `cp39-abi3-macosx_11_0_arm64`; METADATA identifies `umf-weft` 0.4.56 with no Requires-Dist. Four license payloads match actual producer source bytes. The 99-byte wrapper matches the same-source Linux wrapper digest.

Native member `weft/weft.abi3.so` is 32410624 bytes, SHA-256 `7f746042c88dde86b0a096b831a4243d40e2448255c1146cf515787b22c30225`. Its actual header is 64-bit little-endian ARM64, subtype 0, MH_DYLIB 6, consistent with the exact Rust cdylib role. The report agrees with independent native-data observations: one LC_ID_DYLIB `@rpath/weft.abi3.so`; only `/usr/lib/libiconv.2.dylib` and `/usr/lib/libSystem.B.dylib` load dependencies; no rpaths; macOS minimum 11.0.0 and SDK 27.0.0. The sole export `_PyInit_weft` is a regular export at address 388144 and agrees with the defined external N_SECT symbol in exact file-backed executable `__TEXT,__text` section ordinal 1. All 16 load-command entries and 17 section records match the independent prior data inspection. Debug symbol-table content is not miscounted as another public initializer.

## Actual bounded audit and limits

The only audit004 child is the pinned stdlib Python running the accepted static helper against the original wheel, output report, and P56 source, with actual cwd P56. It exited 0 in 0.525 seconds; recorded effective deadline 113.487 seconds is within the 120-second child cap. Monotonic completion 7.104380208 precedes recorded terminal deadline 67.112663208 and original aggregate 180 seconds. Capture EOF completed with no timeout, overflow, truncation, drain expiry, capture error, closure error, or cleanup error.

Its stdout is 395 bytes, SHA-256 `365ad407bc9534c8f9504829f2bb223f016ed7807cfccaefe570dadaca36e8bd`; stderr is empty. Raw/retained/physical identities agree. The output has exactly four regular files: result, report, stdout, stderr. The three non-self evidence rows total 9999 bytes; inclusive result family is 18050 bytes, below 16 MiB. Compressed wheel, expanded wheel, member count and per-member limits remain below 32 MiB / 128 MiB / 160 / 128 MiB respectively. This static continuation created no container, volume, build, installation, or runtime resource to clean; cleanupErrors is empty.

The evidence supports this exact local built/static-only Mac wheel as a publisher input anchor once the separate release profile and outstanding Linux/native/browser/merge/public gates are satisfied. It provides neither Mac functional support proof nor hosted provenance. ARM build/static-only limitations remain separate; no Mac CI or future publication/consumer admission is implied.

Independent data summary: `/private/tmp/g03-macos-build002-audit004-sol-data-review001.json`.
