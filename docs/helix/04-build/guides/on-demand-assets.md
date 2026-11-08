# Explicit pack assets and conformance inputs

The additive host tools verify retained files, prepare a content-addressed cache,
and resolve or materialize explicitly selected inputs. Existing pack manifests,
loaders, tests and corpora remain in place. The migration handoff and concrete
extraction are still pending; these tools do not change default builds or tests.

## Domain packs

The checked-in `scripts/assets/domain-packs.lock.json` binds 789 files to exact
SHA-256 digests, sizes, source identities, media types and a source commit. Its
companion TypeScript pin verifies the lock itself before parsing. Unknown source
metadata and licenses remain in the lock. Composed medical selections include
version/hash-checked component packs, not just the parent manifest.

Prepare selected packs from retained originals, then create an independent
workspace using only the verified cache:

```sh
bun scripts/domain-pack-assets.ts --selector legal-appellate \
  --cache .cache/pack-assets --seed-root . --offline

bun scripts/domain-pack-assets.ts --selector legal-appellate \
  --cache .cache/pack-assets --output .cache/pack-workspace --offline

bun scripts/export-domain-pack.ts \
  --pack .cache/pack-workspace/spec/domain-packs/legal-appellate/pack.json \
  --output .cache/appellate-export --include-sources
```

Each command prints a JSON receipt identifying the lock digest, source revision,
selectors and verified paths. It establishes byte correspondence, not a new
native qualification or license clearance. Existing export rights checks still
apply; some packs cannot be exported with all original sources for redistribution.

After an approved extraction, explicit acquisition can combine retained core
resources, cache hits and pinned remote assets:

```sh
bun scripts/domain-pack-assets.ts --selector legal-appellate \
  --cache .cache/pack-assets --source-root . \
  --output .cache/pack-workspace --download --rights local-use
```

`--source-root` reads and verifies existing files before consulting the cache.
`--seed-root` explicitly copies verified originals to the cache. Without
`--download`, missing files fail rather than access the network. Cache hits are
rehashed; corruption refuses rather than silently fetching replacement bytes.

68 baseline resources have an exact, checksum-matching upstream URL with no
recorded transformation. In addition, the dedicated `domain-pack-assets-2026-10-23`
release now publishes 21 redistributable large files (6,132,614
bytes), including derived CSV/JSON and a TCIA DICOM original. All 21 passed cold hash-verified download and offline materialization. The publication
index is `scripts/assets/published-assets.json`; source rights, original hashes,
media types and attribution remain in each lock entry and the release's provenance
index/notices. These exact-byte URLs do not substitute upstream originals for
transformed projections. The unknown-rights legal `evidence_pages.csv` (747,274
bytes) remains local; no public mirror is selected for it.

Downloads require HTTPS, explicit trusted host allowlists, no URL credentials,
fragments, nonstandard ports, literal IPs, and exact media type,
size and SHA-256. General redirects refuse. The explicit `github-release`
transport alone permits one 302 from a SHA-named GitHub release asset to the exact
`release-assets.githubusercontent.com/github-production-release-asset/` CDN host/path;
all other hops and redirects refuse. The trusted lock separately pins the download
media type while preserving the source media identity. Requests and body consumption have a bounded timeout. Host
allowlisting is operator trust; this helper, like the existing document runner,
does not claim DNS-rebinding protection. Archives are opaque files: this tool
never extracts them. Only validated relative manifest paths are materialized;
symlink components and modified existing destinations refuse. Partial downloads
are removed; verified cache files are published atomically without overwriting
existing objects. Use a private cache/workspace controlled by the invoking user.

## Conformance

Conformance locks are explicit trusted host configuration, not executable data
accepted by the core library. A lock binds a suite source commit, unique asset
IDs/paths, hashes/sizes/media/rights/source identities and named selections with
nonempty case-ID inventories. Every selected asset must resolve before any path
map or materialized cohort is returned. A missing selector, wrong source commit,
missing offline input or tampering refuses before downstream compilation/admission.
The resolver itself does not execute tests, loaders or artifact-supplied commands.

Create a selection document outside the source tree, for example:

```json
{
  "id": "selected-suite",
  "selections": {
    "selected-native-job": {
      "caseIds": ["independently-authored-case-id"],
      "paths": ["path/to/test.ts", "path/to/input.json", "path/to/expected.json"],
      "entrypoint": "path/to/test.ts"
    }
  }
}
```

Pin its exact source bytes:

```sh
python3 scripts/assets/build-conformance-lock.py \
  --root /path/to/suite --revision <exact-source-commit> \
  --selection /path/to/selection.json --output /path/to/cohort.lock.json
```

The builder reads Git objects, verifies their Git identities, streams their
SHA-256 hashes and refuses absent paths, symlinks or an existing output lock. It
prints the new lock's SHA-256. It does not infer imports, discover complete case
coverage or synthesize independent expectations. The selected job owner must
supply its full test/helper/oracle/provenance closure, including required runtime
and packaging resources. This is a lock builder, not a claim of suite readiness.

Resolve the selected source checkout or a pre-seeded cache:

```sh
bun scripts/conformance-resolve.ts \
  --lock /path/to/cohort.lock.json --lock-sha256 <trusted-lock-sha256> \
  --revision <exact-suite-source-commit> --selector selected-native-job \
  --cache .cache/conformance --source-root /path/to/suite --offline
```

Use `--seed-root /path/to/suite` to prepare a cache explicitly. A subsequent
`--offline --output /path/to/qualification-workspace` invocation needs no source
checkout when every selected asset is cached. Store the exact lock and its trusted
digest alongside that workspace in the selected offline qualification archive.
Existing cohort packaging must still capture native toolchains/dependencies; a
resolved file set alone does not make a native job independently reproducible.

The source-lock builder intentionally emits no network URLs and conservative
`rights: unknown`. Approved distribution tooling can add reviewed exact-byte
URLs, media/rights metadata and allowed hosts, producing a **new trusted lock
hash**. The GitHub release exception is opt-in per asset and never applies to
ordinary upstream acquisition. The same explicit download/cache checks then apply. Do not edit a reviewed
qualification lock in place or treat successful downloading as semantic parity.

## Implementation boundary and checks

All runtime I/O is confined to `scripts/assets/`; thin entrypoints are
`scripts/domain-pack-assets.ts` and `scripts/conformance-resolve.ts`. Nothing is
imported into `src/`, public package exports or browser code. The host lock format
is version 1 and is not the `umf.domain-pack` schema or the CONTRACT-057 companion
protocol. Existing declarations do not authorize acquisition; these explicit
commands do. The original companion's runtime/media profile remains unchanged.

```sh
bun test tests/asset-resolvers.test.ts
python3 scripts/assets/build-pack-lock.py --check
```

The pack lock builder defaults to the frozen planning baseline. Rebuilding it for
a new revision requires `--revision <agreed-source-commit>` and generates a new
lock/pin pair; coordinate producer/source changes with migration first.
