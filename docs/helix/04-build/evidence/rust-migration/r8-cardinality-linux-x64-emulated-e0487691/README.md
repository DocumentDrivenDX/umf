---
ddx:
  id: umf.evidence.rust-migration.r8-cardinality-linux-x64-emulated-e0487691
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
    - id: umf.evidence.rust-migration.r8-cardinality-linux-x64-emulated-b505
      kind: references
    - id: umf.evidence.rust-migration.r8-cardinality-final-installed
      kind: references
---

# Docker-emulated Linux x64 Core Cardinality archive evidence

This packet records a local installed-archive qualification from clean commit
`e0487691e34be22de9e63d8ead5f1c9db21fee13`. The runtime was Linux x86_64
under Docker `--platform linux/amd64` emulation on an OrbStack `linux/aarch64`
engine. This is **not hosted Linux CI**.

The SDK package builder reports a fixed-point source closure with zero
transforms. Source closure and captured-live SHA-256 are both
`1355bf21b58ad9e422fa8998c1ce5325b8643bb1eefbc6a1b6a127babc52b5d7`.
The private archive SHA-256 is
`7f36bce11d7eac07aa1235b8d192e64b1aacc2a000934984080890291a915c6f`, and
its manifest SHA-256 is
`7a058f701a3c0c1f94b338e102f544e1fe6dc6c595d953ea111a57296f924e0f`.
The archive is 44,094,530 bytes. It has 1,807 regular tar entries; the
installed receipt verifies 1,806 payload members because `package/manifest.json`
is separately checked and does not hash itself. The private archive is omitted.

The full workflow-equivalent build completed `bun run typecheck`; archive
integrity passed all 9 checks in `scripts/test-sdk-package.py`. The raw
[installed receipt](installed-receipt.json), SHA-256
`189d526cb65c26a74510a8dd83d67f6c71d2738c7242c9aa85365a35d43d4255`, reports
`pass` for `inspectCoreCardinality`, `declareCoreCardinality`, and
`verifyCoreCardinalityDeclaration`. Node v26.12.1, Bun 1.4.3, and Chromium
153.0.8010.12 passed parity. Chromium requested packaged WASM and made zero
external requests. The receipt also records installed-reference and frozen
TypeScript-envelope parity, host admission/order, Proxy traces,
caller-thrown spoofed error identity, and genuine UMF error shape.

## Delta from the b505 archive

The tar member-name sets are identical: both contain 1,807 regular entries,
with no added or removed names. Four member hashes changed:

| Archive member | b505 SHA-256 | e048 SHA-256 | Reason or observation |
| --- | --- | --- | --- |
| `package/manifest.json` | `fa75627c970cdaec51b58383f92d1f92ba17d67b62c469176c61787142c60bba` | `7a058f701a3c0c1f94b338e102f544e1fe6dc6c595d953ea111a57296f924e0f` | Updated SDK manifest binding the changed source closure. |
| `package/dist/rust-default-manifest.json` | `23228270b90c38e95caace41a89e819406e968373ad249cc674f8caf49c6452a` | `7b2bb6c5f41ba9bd8f25a8f7128fc9ece11903cc213edfe14405ef0063c13109` | Updated source closure; both manifests report fixed point and zero generated transforms. |
| `package/dist/umf_core_node.node` | `e1444b7811ce3e89fcd643faeff9dde7eb2ae771d58bae63c453feac80458e12` | `a556321c907fce097e75a46e9b41d48b03929b47bbf876734df356f8d9cb7493` | Independently rebuilt ELF has a different GNU build ID and embeds its randomized temporary source path in debug/symbol data. Loadable/code section sizes and virtual layout match; the ELF string table differs by six bytes. The hash is not reproducible across these separate builds. |
| `package/dist/umf_core_wasm_bg.wasm` | `c93315b7ddae649f5e627c85455f13b3b42b4b2b7fdcd9be392240ad2f1dc4ff` | `9f2470d98dc1cb2e96ee1c7747917476bc3382a2ac37d7be32c8e04a53caf651` | The only byte differences are the corresponding randomized temporary source-root strings; after equal-length normalization of those roots, the WASM bytes are identical. |

No additional tar member was introduced by the committed b505 evidence packet.
The only b505-to-e048 changed file among the package builder's explicit source
inputs is `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md`; this
contract correction accounts for the changed source-closure digest. The new
Linux evidence packet is not part of that explicit source closure.

This is private, bounded evidence. It does not establish hosted CI, complete
SDK closure or CONTRACT-040 acceptance, native container behavior, resource
authority, ledger retirement, expanded support, or release qualification. It
authorizes no selector retirement, ledger change, or publication.

## Reproduction

Use a clean source checkout of commit
`e0487691e34be22de9e63d8ead5f1c9db21fee13` and a separate current
checkout containing this evidence packet; the packet was added after the
source commit and must stay outside the source snapshot. Set
`PACKET_DIRECTORY` to this packet's absolute path, then build the qualification
image from the included [`Dockerfile`](Dockerfile) with amd64 emulation:

```sh
docker build --platform linux/amd64 \
  -t umf-r8-sdk-linux-x64 \
  -f "$PACKET_DIRECTORY/Dockerfile" \
  "$PACKET_DIRECTORY"
```

Create an output directory outside the source checkout, then run the included
[`qualification script`](qualify.sh). Replace `SOURCE_CHECKOUT` and
`OUTPUT_DIRECTORY` with absolute paths:

```sh
mkdir -p OUTPUT_DIRECTORY
docker run --rm --platform linux/amd64 \
  --mount type=bind,src=SOURCE_CHECKOUT,dst=/src,readonly \
  --mount type=bind,src="$PACKET_DIRECTORY",dst=/tasktmp,readonly \
  --mount type=bind,src=OUTPUT_DIRECTORY,dst=/out \
  umf-r8-sdk-linux-x64 \
  sh -c 'rm -rf /tmp/umf-source /out/* && sh /tasktmp/qualify.sh'
```

The script copies the source snapshot into container-local storage, installs
locked dependencies, builds Node and WASM routes, runs the full TypeScript
typecheck, verifies fixed-point status, builds and checks the archive, installs
Playwright Chromium, and runs the installed replay. Network access is needed to
build the image, fetch locked dependencies, and install Chromium. Image and
remote package version tags are used; immutable image/package digest pinning is
not claimed.

`platform.txt` omits the transient container ID and host-kernel string from the
original `uname -a` output. `SHA256SUMS` recursively hashes every packet file
except itself; verify it with:

```sh
cd docs/helix/04-build/evidence/rust-migration/r8-cardinality-linux-x64-emulated-e0487691
sha256sum --check SHA256SUMS
```
