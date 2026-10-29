# Core 0.10.2 repaired Linux artifact review

Verdict: **ACCEPT for selection of the exact repaired wheel below**, with publication and fresh public-download verification remaining subsequent gates. Review used only standard-library JSON, hash, ZIP and XML reads; no product, native, tool or test execution and no Git action.

## Exact identity

Hosted run 40359647952, attempt 1; artifact 12667128999. Retained ZIP `/private/tmp/core-manylinux-40359647952-12667128999.zip`: 3,394,284 bytes, SHA256 `6951c2c2a3adffbadddb2cc0672d94b7d0fbd8a443251ee97a2113a573902eb1`. Independently verified all 39 unique ZIP files byte-for-byte against `/private/tmp/core-manylinux-40359647952`, with no missing or extra extracted file.

Selected wheel: `umf_core-0.10.2-cp311-abi3-manylinux_2_34_x86_64.whl`, 3,582,082 bytes, SHA256 `708f967747b0539b9ca7b6a5f39d1017eea8ddb1d07cd62f4f46592e088f6f39`. Native SHA256 `78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8`.

Product source is `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`, clean tree `f9f1655af59c4c030e58a19405fe22ae55db40bb`. Harness source is separately `433bfebcba88107995a6a0552dd319d20eb20272`, tree `1bce081939eaa81d01dafc902a04d6f760caa7d9`. Actual 11 pinned product/verifier/test inputs match the frozen Core checkout. Distribution 0.10.2 and semantic Core 0.10.0 remain distinct.

## Evidence checked

- Raw and repaired auditwheel structured reports independently state the actual minimum `manylinux_2_34_x86_64`; both overall and symbol policy agree. This conclusion is not derived from a filename substring or Ubuntu version. ELF is 64-bit x86-64 ET_DYN with recorded GLIBC requirements through 2.34. External libraries and policy upgrades are empty; unsupported ISA, pyfpe and ucs2 flags are false.
- Actual repair command and log produced the selected filename. Its one WHEEL tag is exactly `cp311-abi3-manylinux_2_34_x86_64`. Comparing the repaired wheel with the independently qualified raw wheel yields the same 40 non-directory members, no duplicate member names and no grafted `.libs`. Only WHEEL and RECORD contents differ. All package files, including the native extension and 33 nonnative payload files, remain byte-identical.
- Hash-locked acquisition and installed tool records agree on auditwheel 6.8.2, packaging 25.0, pyelftools 0.32 and patchelf distribution 0.17.2.4 (executable 0.17.2). The selected locked patchelf executable and its recorded hash match the repair environment.
- Strict wheel payload verification passes before and after the installed suite. Installed identity records are byte-identical before/after; installed payload records agree on this wheel and native digest. JUnit independently contains exactly 254 tests, zero failures, errors or skips. The original six-module suite and assertions were retained.
- All 18 expected command records have raw/capture exit 0, no timeout, truncation or capture error, and applied command limits no greater than 180 seconds. Every recorded log byte count and SHA matches. Actual logs total 11,033 bytes; evidence 248,892 bytes and the closed complete artifact family 3,833,477 bytes agree with the receipt and remain under the original 1 MiB log, 4 MiB evidence and 16 MiB family limits. The accepted harness retains the original 20-minute aggregate and cleanup reserve; this review does not invent a separately measured wall duration.

Receipt SHA256 `4fd6a49266194ff857838cb22544f0b86619e3dc50188d1d6a83a24001d7c00c`; qualification SHA256 `7a76bd7416d4564467e11a08205ef9ca46dac3a235a7a19568b1794b3e1c0ad9`; command records SHA256 `8f1cbce4005fbe8c76421ff3d9d9cd752f5c47314c2862fd05f06ea6cbb5aea6`; JUnit SHA256 `89a7b89a9c769d1ae18d246238e0d51e5eda671590db7a9ac3be1a9aaa1d0830`.

## Scope and remaining gates

This accepts the exact repaired Linux artifact and its recorded Ubuntu 24.04/Python 3.11.17 x86-64 installed qualification. Auditwheel policy evidence establishes the reported ABI floor; it does not establish runtime testing on every older Linux distribution, ARM, musl or other Python environment. It does not authorize publication or claim released public bytes.

Release selection may use this repaired wheel with the separately accepted Mac direct wheel and single source distribution. The raw Linux wheel remains historical candidate evidence, not a top-level publisher input. Preserve original source and repair receipts, normal required CI, immutable release identity, publisher authorization and subsequent exact public-download verification.
