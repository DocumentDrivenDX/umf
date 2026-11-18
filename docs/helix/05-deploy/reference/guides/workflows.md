# Workflows

A workflow describes how an enrolled record moves through typed effects, guards, pauses and exits. It can carry typed run state and route on declared effect outcomes.

UMF 0.10.13 ships umf.workflow 0.1.0 for module-level declarations with core 0.10.0. The declaration retains the original JSON source. Preparation selects the umf.workflow/1 or umf.workflow.correlated/1 profile explicitly.

Both profiles support exact elapsed waits. The correlated profile can resolve a wait early from an eligible event. The follow-up reply fixture uses a 90-fixed-day window and tests cases including timeout and stale events.

Rust provides inspect_source and compile_source. The browser WASM SDK exposes createWorkflowEngine for inspection, compilation and elapsed-duration parsing. Consumers own runtime clocks, scheduling, effect dispatch and durable state.
