---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-linux-x64-emulated-b505
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-cardinality-final-installed
      kind: references
    - id: umf.evidence.rust-migration.r8-core-cardinality-installed
      kind: references
---

# Docker-emulated Linux x64 Core Cardinality archive evidence

This packet preserves one local installed-archive qualification from the clean
source at commit `b50523cdaa8f90fac0e2714326a557b95aa1170f`. The runtime was
Linux x86_64 under Docker `--platform linux/amd64` emulation on an
OrbStack `linux/aarch64` engine. It is explicitly **not hosted Linux CI**.

The private SDK archive was fixed-point: source closure and captured live source
both have SHA-256
`5564642b25543372aa160df665c5b696664ec447397f09f7de0ec95dfebe0eeb`, with
zero source transforms. Its SHA-256 is
`eea56e3ae4b00f55b322064d641043d35d374604ec0a0be1dc04f527d8a1fdfc`
and its manifest SHA-256 is
`fa75627c970cdaec51b58383f92d1f92ba17d67b62c469176c61787142c60bba`.
The archive contains 1,807 tar entries (1,806 verified payload members); its
Rust manifest records 3,550 source inputs and 1,800 packaged assets. The 44,094,608-byte archive is
intentionally omitted. Its digest is bound by the raw installed receipt and
repeated here for independent verification.

The full build recipe completed `bun run typecheck`; archive integrity passed
all 9 checks in `scripts/test-sdk-package.py`. The raw installed receipt reports
`pass` for the bounded operations `inspectCoreCardinality`,
`declareCoreCardinality`, and `verifyCoreCardinalityDeclaration`. Node v26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12 produced matching results. Chromium
requested the packaged WASM and made zero external requests. The receipt also
records installed-reference and frozen TypeScript-envelope parity, host
admission/order, compared Proxy traces, caller-thrown spoofed error identity,
and genuine UMF error shape.

This evidence is private and deliberately narrow. It does not establish hosted
CI, complete SDK closure or CONTRACT-040 acceptance, native container behavior,
resource authority, logical ledger retirement, expanded support, or release
qualification. It authorizes no selector retirement, ledger change, or
publication. The related Darwin-arm64 evidence remains separately scoped in the
[final installed Cardinality packet](../r8-cardinality-final-installed/README.md).

## Reproduction

Use a clean checkout of the frozen source commit above, before adding this
packet, and Docker with amd64 emulation. Build the qualification image from the
included [`Dockerfile`](Dockerfile):

```sh
docker build --platform linux/amd64 \
  -t umf-r8-sdk-linux-x64 \
  -f docs/helix/04-build/evidence/rust-migration/r8-cardinality-linux-x64-emulated-b505/Dockerfile \
  docs/helix/04-build/evidence/rust-migration/r8-cardinality-linux-x64-emulated-b505
```

Create an output directory outside the source checkout, then run the included
[`qualification script`](qualify.sh). Replace `SOURCE_CHECKOUT`,
`PACKET_DIRECTORY`, and `OUTPUT_DIRECTORY` with absolute paths to the clean
`b50523cda` checkout, this packet's directory, and the output folder:

```sh
mkdir -p OUTPUT_DIRECTORY
docker run --rm --platform linux/amd64 \
  --mount type=bind,src=SOURCE_CHECKOUT,dst=/src,readonly \
  --mount type=bind,src=PACKET_DIRECTORY,dst=/tasktmp,readonly \
  --mount type=bind,src=OUTPUT_DIRECTORY,dst=/out \
  umf-r8-sdk-linux-x64 \
  sh -c 'rm -rf /tmp/umf-source /out/* && sh /tasktmp/qualify.sh'
```

The script copies the source snapshot into container-local storage, installs
locked dependencies, builds the Node and WASM SDK routes, runs the full
TypeScript typecheck, verifies source fixed-point status, builds and checks the
archive, installs Playwright Chromium, and runs the installed three-operation
replay. Network access is needed to build the image, fetch locked dependencies,
and install Chromium. The image pins version tags; it does not claim immutable
base-image or remote-package digest pinning.

`installed-receipt.json` is the raw harness receipt;
`sdk-manifest.json` is the exact package manifest. `platform.txt` retains the
runtime architecture and tool versions while omitting the transient container
ID and host kernel string from the original `uname -a` output. `SHA256SUMS`
recursively hashes every file in this packet except itself. Verify with:

```sh
cd docs/helix/04-build/evidence/rust-migration/r8-cardinality-linux-x64-emulated-b505
sha256sum --check SHA256SUMS
```
