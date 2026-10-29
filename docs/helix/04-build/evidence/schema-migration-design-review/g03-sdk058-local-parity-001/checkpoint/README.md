# SDK 0.5.8 parity019 checkpoint proposal (HELD)

This directory is a private byte-preserving adoption proposal for the existing
HELIX SDK 0.5.8 evidence and the paired local parity019 result. It is not an
adopted repository artifact, a release announcement, or proof of public
publication. The original source and receipt files remain untouched. The
`copy-manifest.json` records each staged source path, destination, byte count,
and SHA-256; copied payloads were rehashed after copying.

## Observed outcome and limits

The retained parity019 combined owner receipt reports
`PASS_LOCAL_FINAL18_G03_PYTHON_AND_INSTALLED_SDK_CHROMIUM` after 112.565 seconds.
It records separate Python and installed-SDK Chromium lanes, 90 external pins,
unchanged SDK installation checks, and verified container absence. The independent actual-run review is retained and accepts the selected local
parity result. This is a scoped local acceptance; it does not establish full SDK
release assembly, publication, managed adoption, or macOS runtime support.

The existing local build checkpoint records independent acceptance of the
standard Linux SDK build and one 139-case installed-consumer check. Weft 0.4.56
metadata merged normally in PR #46. These observations do not establish a fully
assembled SDK release, GitHub release/tag/assets, PyPI upload, or fresh public
proof. No public 0.5.8 release is claimed. macOS evidence is build/static-only;
there is no macOS runtime, native, or browser qualification. GitHub Actions and
macOS CI remain off.

The accepted parity019 owner receipt records 43 terminal files, 4,634,696
inclusive evidence bytes (including owner receipt), and 8,935 raw bytes. The
independent review accepts that actual under its stated profile and limits.

The parity018 combined failure is retained with its own owner receipt and raw
captures. Its independent Python lane and browser refusal are retained separately
and are not stitched into a passing combined result. Parity013, 014, and 016 are
represented only by their historical failed/unknown owner receipts and source
reviews; their source packets and run directories are intentionally not copied
or represented as complete accepted evidence.

## Included evidence

- Parity019 complete 13-file source closure and three envelopes; combined owner,
  Python lane, installed-SDK Chromium lane, and source-only review.
- Parity018 complete source closure and three envelopes; failed combined owner,
  separate full Python lane, browser refusal, and source review.
- Parity013/014/016 historical owner receipts and their source-only reviews.
- Parity009 dependency metadata inventory, preflight source, owner/metadata
  receipts, runtime import census, and source/actual reviews.
- Packaging-control004 frozen source and actual002 capture with source/actual
  reviews. The official packaging-25.0 input includes acquisition source,
  metadata, lock, and static audit only.
- Existing adopted SDK local-build checkpoint README.

## Exclusions

No SDK or dependency software binary, SDK archive/tarball, wheel, installed SDK
or tool environment, Bun executable, node_modules, virtual environment, or
executable tool payload is copied. The official `packaging-25.0-py3-none-any.whl`
is intentionally excluded; its acquisition receipt and static metadata are kept.
Source manifests may mention external artifacts, but those references do not
mean those binary artifacts are included. The exact exclusions are recorded in
`exclusions.json`.

## Proposed HELIX text

`proposed-docs/sdk-release-notes-0.5.8.md` and
`proposed-docs/schema-migration-plan.md` are proposed full-file copies of the
existing HELIX artifacts. The release-note frontmatter ID and the migration-plan
frontmatter ID/links are preserved. Adoption should wait for independent review
of the parity019 actual run; no publication or release status is inferred here.
