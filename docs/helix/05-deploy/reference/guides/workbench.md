# Use the local workbench

Start with a YAML example, choose a registry, then run an operation. Use the JSON toggle to change the input format while keeping edited values. UMF examples use core 0.10.0. Your source remains editable and downloadable even after a refusal. Formatting refuses malformed, duplicate-key or noninteroperable input without replacing it; the original remains downloadable. Protobuf source keeps its native syntax.

Core validation, serialization, metadata selection reuse the public library. Native JSON Schema-to-Protobuf projection retains source and reports unenforced constraints. Strict policy refuses lossy output; report policy shows generated proto3 source plus losses. This is schema projection, not instance conversion.

Optional Protobuf compilation uses the pinned local WebAssembly compiler with an explicit source bundle. Missing imports and unsupported source Editions refuse; no remote dependency is fetched. A fixed browser validation profile does not dynamically compile arbitrary native instance validators.

Cancel terminates the worker. A late result cannot replace new input. Limit or permission failures are visible. Files, originals and diagnostics stay in the browser; no analytics or input persistence is introduced.
