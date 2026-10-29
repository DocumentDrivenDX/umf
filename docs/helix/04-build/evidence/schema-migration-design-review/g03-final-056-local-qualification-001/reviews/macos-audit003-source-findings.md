# G03 Mac audit-only003 — affected source review001

**CHANGES REQUIRED: two finite families before audit execution.** This reviews the frozen audit-only helper/driver against plan `cad229b19abb5b61423aa37065d2de751e9e3ba417dbab484baa00e70629af24`. No helper/operator/product execution, imports, AST/symtable parsing, tests, build, Docker, Git or network operation was performed. Own stdlib source/hash/JSON inspection only; output003 is absent.

| File under `/private/tmp/g03-macos-static-audit-only-operator-003` | Bytes | SHA-256 |
|---|---:|---|
| static_audit.py |15464|`78d8fe35974540e2e18f84305a62daaccbe73f370c23a50a2e2192ec17eea0f9`|
| run_static_audit.py |17469|`7c123d207cd3765a8a92fe588ec3bd2a71f7ea332b09dc2a3bb52634cf521f26`|
| README.md |3356|`aaeccc30427f77616ff8e19cd1b2f0f3589c686d93a68480b3a9550c70e17081`|
| source-identities.json |3316|`13fa1d6ff8430d91247747035e671b128b6718775a7bd1637cb2fde9efa51fe8`|

All operator-manifest rows match physical bytes. Source custody assets are exact: canonical235,442-byte rows JSON SHA `6a671799d5be7a511cc6b5f7c9282d8745fbc80f4a5d796538b6643e8492f2a2`;780,359-byte trimmed stage roster SHA `bc3018c0d674cd2fc80794f9f36c523565c91558f70649cd3fe415f8e88b701b`;619-byte custody SHA `e936a962be023654bd045cafa1f02d664e06e4c6bd6f686e4441f8558e027621`. Own data reads verified all1,459 unique source rows/134,880,002 bytes against current physical P56 files. These newly exported rows match the original002 recorded digest; they are not retroactively inserted into the failed receipt. Driver binds exact original failure, plan, wheel, Python and prior helper and rechecks the entire physical source map pre/post without a Git subprocess.

The corrected scope is appropriate: exact MH_DYLIB6/ARM64 subtype0, sole self ID @rpath/weft.abi3.so, observed two system loads/no rpaths, original wheel/native hashes, all9-member/RECORD/metadata/wrapper/license/section/linkedit bounds, no build or candidate execution. Original002FAIL is preserved. Fix only the following affected points in one batch.

## MA-F1 — export cursor and initializer section binding

In `static_audit.py:parse_exports`, `terminal,p=uleb(...)` establishes the beginning of terminal payload and `te=p+terminal` its end. The terminal is decoded using q, but child-count is then read from **p**, still the terminal payload start. Set `p=te` before checking/reading child-count. Otherwise a terminal with flags0 is misread as child-count0, hiding missing/malformed child data or real children. Retain all range/ULEB/node/cycle/regular-export/name restrictions; no relaxation of exact initializer or payload semantics.

The nlist initializer check requires section!=0 but not section<=len(sections), and address validation searches any section independently of the symbol's declared ordinal. Require `1 <= initializer.section <= len(sections)` and bind its exact ordinal section to the file-backed address/range/export symbol, using actual load-command section ordering. Reject malformed/out-of-range/wrong ordinal, zero-fill, or address outside that declared section. Keep the existing non-STAB defined external uniqueness and export address equality. Actual inspected wheel has the intended section1 __TEXT/__text, so this is a predicate correction, not a new product operation or broad format admission.

## MA-F2 — driver terminal evidence, exact child identity and truthful capture

`hash_file` always checks work DEADLINE=START+120. `finally` never switches it to the reserved terminal window; after an audit timeout, terminal source/wheel/log hashes fail against an expired work deadline. Moreover the final evidence hash loop is outside the protected receipt-write try, and fallback `write_json(OUT/'result.json',...)` opens with xb even though a seed result already exists. Terminal exceptions can therefore escape without updating the seed with actual failure/capture information. Make the terminal path one guarded finite closure with an active deadline clamped to shared remaining180s and <=60s finalization (retain grace/publication margin). Bound terminal reads/waits and publish actual failure receipt by atomic replacement, not exclusive creation over the seed. Never emit success after missing/unverifiable/oversized receipt, source drift, timeout or incomplete capture. Verify durable result bytes/hash and full selected family including both logs before final success. Preserve initial seed if even replacement is impossible, return nonzero, and do not swallow a write failure into PASS.

Keep the single120s bounded audit command; make its physical capture/failure record retainable within the terminal reserve when work expires. Child capture record must match reality: Popen currently omits cwd while reporting SOURCE; set the actual fixed cwd=SOURCE (or report actual cwd honestly). Include actual monotonic start/end with UTC/elapsed/exit/timeout/truncation/physical hash fields under existing bounds. No extra command or runtime probe.

The driver measures helper bytes but does not compare them to an expected reviewed identity before invoking it. Add the successor helper's exact frozen SHA/size check (or closed operator source-manifest row check) before the sole child invocation. Own runner pre/post hash remains externally bound by the reviewed Q; do not create an impossible self-hash literal. Keep pre/post helper/Python/original result/wheel/source comparisons. Use read_capped for the original result and generated static report instead of unrestricted rereads after a separate hash, preserving before-read caps/hash correspondence. All child/path/argv/source pins remain fixed.

No broader source rework, product controls or alternate platform is required. Keep180aggregate/120audit/60terminal/10grace,1MiB logs/16MiB metadata,32/128MiB wheel and member160 limits. The stricter audit-only aggregate is valid; it must actually reserve its terminal interval. README's old 'six producer files' phrase should reflect full1,459-row source verification so scope stays unambiguous.

After exact corrected-source freeze and affected closure, root may run the single audit-only continuation on original wheel68f9297b… with no rebuild/import/install/native/compiler/browser/MacCI. Only a later actual report/custody review may accept static output; this source review does not relabel build002 or assert any runtime/publication gate.
