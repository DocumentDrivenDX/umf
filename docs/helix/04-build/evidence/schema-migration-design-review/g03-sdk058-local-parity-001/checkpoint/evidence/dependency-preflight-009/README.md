# SDK parity009 existing dependency metadata preflight

This source-only successor preserves the parity008 launch failure and binds the two accepted metadata-only prerequisites: creation of an ignored empty `node_modules` mountpoint in the exact P source volume and a no-start Docker mount-configuration control. It observes the existing Linux dependency volume `umf-migration-source-267675510` twice: the `node_modules` subpath is mounted read-only at `/volume-producer/node_modules`, and the whole volume is mounted read-only at `/dependency-origin`. The actual Docker configuration records `VolumeOptions.Subpath: node_modules`; runtime `Mounts.Source` paths are captured separately and are not interpreted as filesystem subpaths.

The guest reads P and dependency-origin `package.json`/`bun.lock`, requires the accepted exact lock digest, and permits only the package `version` field to differ. The host verifies the selected source, nested dependency and whole-origin mounts by their configured volume, target, read-only state and configured subpath, then records runtime mount observations separately. It verifies an exact static import census for both corpus entrypoints, reads the selected `ajv`/`yaml` manifests and their transitive lock descriptors, and inventories the complete dependency tool view including directory modes, regular-file modes/sizes/SHA-256, and safe internal symlink targets without following them. It refuses missing, escaping, ambiguous, nonregular, changed, or over-limit entries. The view is bounded at 256 MiB regular bytes and 64 MiB per file; public inventory/receipts/logs fit within 16 MiB with raw stdout/stderr limited to 1 MiB. One host owner enforces 180 seconds including cleanup and absence verification. A failed Docker launch remains the primary failure even if later inspection or cleanup also fails.

After root admission and Sol source review, root may execute:

```sh
python3 /private/tmp/g03-sdk058-parity-009-preflight/preflight.py \
  --admission /private/tmp/g03-sdk058-parity009-root-admission-001/admission.json \
  --admission-sha256 <root-admission-sha256>
```

The output directory is `/private/tmp/g03-sdk058-parity-009-preflight/out` and must be empty before the run. A passing metadata receipt establishes only the identity and custody of a reusable tool input. It is not a product, G03, browser, or typecheck result. The eventual parity route must separately bind these physical output hashes and verify the admitted dependency inventory before and after use.
