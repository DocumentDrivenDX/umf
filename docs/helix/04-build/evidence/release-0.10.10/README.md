# UMF 0.10.10 local release evidence

The installed SDK probes use the exact Mac arm64 and Linux x86_64 archives named
in `qualification.json`. Default `initializeWasm()` and both WASM and native
`copyJson` succeed in Node and Bun with `fetch` blocked. The Chromium probe
uses HTTP and observes only the two expected local WASM paths. The installed
TypeScript declaration resolves the public runtime export.

The matching local Python pair generates the same seven-file DDL, ORM and CRUD package
on both platforms and verifies all ten resources. Linux execution used amd64
emulation with glibc 2.34. Auditwheel repair preserved all 72 payload files.
Both CLI archives carry the exact tested binaries from the matching wheels.

The native producer snapshot comes from the common sdist. The final source
commit adds only an action producer identity file outside that sdist. The
source join and common input map preserve the actual native source identity.
Mac and Linux SDKs use the same captured source closure and differ in the
native addon and corresponding manifests. The full source archive matches all
70,600 tracked Git members.
