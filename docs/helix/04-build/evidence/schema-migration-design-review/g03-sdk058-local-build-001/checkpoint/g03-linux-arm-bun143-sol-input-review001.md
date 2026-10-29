# Linux ARM Bun1.4.3 input acceptance

ACCEPTED as the exact acquired Linux ARM tool input with version-startup compatibility only for the pinned ARM Chromium image. No SDK/Bun build/serve, Chromium parity, product/native behavior or broader platform claim follows. Sol performed static archive/ELF/data reads and independent hashes only; no tool, product, Docker or network execution occurred. This explicitly authorized private review is the only write.

Acquisition receipt `/private/tmp/g03-linux-arm-bun143-001/receipt.json` is1078 bytes/SHA-256 `9414f1649385221c6640f1a9c59ecd3b4e0c5bac900d9864127106d7c6bfdd5f`. Startup receipt1900 bytes/SHA-256 `3fcc5a52f7f447dc6fd229847a5f0f26fd88f92f383c4e08e077b7fd3fa01896` matches root's announced pin. Official retained release metadata `/private/tmp/g03-bun143-release-metadata-001.json`, SHA-256 `e1a2ea02241b245752a440439fb4e7432585aef5b7453880ec073174704bf0f4`, identifies oven-sh/bun release408543611/tag bun-v1.4.3, not draft/prerelease.

Sol independently matched both physical downloads to their exact asset IDs/names/URLs/sizes and the official API's SHA-256 digest fields:

- Asset626788529 bun-linux-aarch64.zip:41786424 bytes, `efa9813da5ed72423bf847f916e8d2c47c0d776add972354026a75e10da9aa21`.
- Asset627094097 SHASUMS256.txt:3431 bytes, `861ce0f19aa4f8a94bef81045c7fcad38dbb2343f2c6e2d6bdc8561be5dba637`.

The publisher checksum file contains exactly one selected bun-linux-aarch64.zip row with the same archive digest. This is retained official metadata/checksum correspondence, not an additional live download/query or a detached-signature verification claim.

Independent ZIP inspection confirms exactly two safe unique members: directory bun-linux-aarch64/ mode0755 and regular bun-linux-aarch64/bun mode0755, no symlink/absolute/traversal members. The extracted physical `/private/tmp/g03-linux-arm-bun143-001/bun` exactly equals the ZIP member,88465160 bytes/SHA-256 `029ece746ac9f970c76d8f48bdd1b1d0c52f3636b74d19f546f5e7c1165c0abe`, physical mode0755. Static header parsing confirms ELF64 little-endian/e_machine183(AArch64), with interpreter /lib/ld-linux-aarch64.so.1. No binary was invoked by Sol.

Root's actual startup receipt records exit0/version1.4.3 in exact Linux/arm64 Chromium image `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`, networknone, ownedContainerAbsent=true. Sol independently closed physical version.stdout.log6 bytes/SHA-256 `bd31e8d9cf8d14a1e9e3fdf3b9f6a524819aed0d1b14627523c6765767c7d8f1`, exactly1.4.3 plus LF; version.stderr.log and owned-absence.stdout.log are empty with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. This is startup metadata only; it does not exercise Bun build/serve APIs, package resolution or the browser. No new live absence query occurred in this review.

Use this executable read-only at a fixed reviewed tool path in the later parity operator, retaining exact binary/archive/API/checksum/startup pins. Keep the already selected Bun1.4.3 actual replacement explicit versus repository packageManager1.4.2, original SDK/corpus/consumer/archive same-path custody, pinned Chromium/Playwright inputs, networknone/loopback-only and existing bounds. The unchanged installed SDK adapter and its real actual report still require their own execution review under `/private/tmp/g03-sdk-linux-arm-bun-route-sol-plan001.md`. No fallback binary, arbitrary loader installation, SDK rebuild, Actions, Mac runtime/CI or Praxis work is authorized by this input acceptance.
