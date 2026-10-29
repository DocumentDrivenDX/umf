# G03 Mac audit-only004 — affected source closure001

**SOURCE ACCEPT.** MA-F1 and MA-F2 from review `bda29f0c63579caff2fee8327a9be0f4d2f946d51dcdcfd10841481402cf3326` are closed for this fixed audit-only continuation. Review used source diff/text, JSON and hashes only; no helper/operator/product execution, imports, AST/symtable parsing, tests, build, Docker, Git or network operation was performed.

| File under `/private/tmp/g03-macos-static-audit-only-operator-004` | Bytes | SHA-256 |
|---|---:|---|
| static_audit.py |15878|`ff38aded4a48b285a7c0c6f1bc02def7b24fcd7890dd896a440ea38ebf833fb6`|
| run_static_audit.py |22917|`7657c0a79f34a67ddcdbe359ab1910a56642b1b95ee06af18881b77afbf3e4ce`|
| README.md |3820|`a8bda4040b890ce96ce88b0d1650131ff7f2d16316a189f3e7ee1595bba74e3c`|
| source-identities.json |3642|`f3e5566f074d74edb898abe3b6e06d62422587fd8710678890f6034da5a3b768`|

All manifest rows match actual bytes. Source custody assets remain exact235,442-byte/6a671799… source rows,780,359-byte/bc3018c0… stage roster and619-byte/e936a962… custody. The previously independently checked full1,459-row/134,880,002-byte P56 source roster is unchanged as an input. Operator003's helper/driver/manifest are byte-identical to their frozen prior tuple. Output004 is absent at review.

MA-F1: export-trie cursor now advances to te before child-count/edge decoding, preserving bounded ULEB/range/node/cycle/regular-export checks. The non-STAB external initializer requires an in-range section ordinal and selects that exact ordinal section. It must be executable, file-backed __TEXT/__text with instruction flags and contain the initializer address; export and nlist addresses must match. The exact MH_DYLIB6/ARM64 subtype0, self ID @rpath/weft.abi3.so, two observed system dependencies/no rpaths, original native/wheel hashes, SDK/minimum and all prior archive/RECORD/metadata/wrapper/license/section/linkedit predicates remain. No broader file type or runtime admission was added.

MA-F2: work deadline and terminal deadline are now distinct. Finalization activates one <=60-second window clamped before the180-second aggregate/publication margin. All terminal source/wheel/helper/driver/Python/original-result/evidence hashes and bounded rereads use it. The entire finalizer is protected; the initial durable failure seed is atomically replaced, including on fallback, and a failed/missing/oversized/unverifiable terminal result cannot yield process success. The actual prospective complete report/two-log/result family is capped before publication; final receipt is physically rehashed and verified, with a verification/fallback margin. Timeout/incomplete capture/source drift remains nonzero/FAIL_OR_UNKNOWN.

The sole child uses actual cwd=SOURCE and the exact pinned Python/helper/wheel/report/source argv. Helper size/hash is checked against the reviewed constants before invocation. Capture records actual UTC and monotonic start/end, duration, exit, timeout/drain/truncation, errors and separate raw/retained hashes. Terminal closure verifies both physical logs against retained captures, complete report hashes and capture status. Original receipt and report are consumed via bounded stable reads. Existing source/custody pre/post checks and original002 failure lineage remain separate from new audit status.

Root may run this one-shot local stdlib static audit on the unchanged original11,190,603-byte wheel68f9297b…/native7f746042… into fresh `/private/tmp/g03-weft-macos-arm64-audit-004`. Limits remain180aggregate/120audit/60terminal/10grace,1MiB logs,16MiB evidence,32/128MiB wheel and member160. There is no build, Cargo/Maturin, product installation/import/native/compiler/browser execution, Docker, Actions or Mac CI command.

Only actual subsequent report/capture/custody review may accept the static artifact. This source acceptance does not rewrite original build002FAIL, imply an audit ran, qualify dynamic loading/ABI3/runtime behavior, or close release/publication gates.
