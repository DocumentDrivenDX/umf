# Portable JSON-LD source adjustments

These vendored crates are unmodified upstream source copies except for the
explicit, narrow changes described here. Original manifests and license files
are retained.

- `hashbrown` 0.12.3 and 0.13.2 add an opt-in `umf-deterministic-hash`
  profile. In that profile the default builder is
  `BuildHasherDefault<std::collections::hash_map::DefaultHasher>` and the
  default collection constructors remain available. Their ordinary upstream
  `ahash` profile is unchanged.
- `json-ld-core` 0.21.4, `json-ld-syntax` 0.21.4, and `json-syntax` 0.12.5
  disable hashbrown defaults and select the deterministic profile in their
  existing hashbrown dependencies. Parsing, equality, and JSON-LD algorithms
  are unchanged.
