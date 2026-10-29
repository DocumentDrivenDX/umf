# Truss009 browser tmpfs execution-profile correction

This source-only derivative implements the accepted finite Sol plan `/private/tmp/g03-truss-browser-tmp-exec-sol-plan001.md` (SHA-256 `109a7a216064b33255dff26e91c9c8784b724d3fd0426311bbfddbdeb6a3724d`). Truss008 remains `FAIL_OR_UNKNOWN`; its TargetClosed cause is not proven, and its partial guest observations are not transferred as a successor pass.

Only the browser-role tmpfs policy changes, at its three coupled source sites: the closed `role_tmpfs['browser']` expectation, the unchanged-size browser `docker run --tmpfs` argument, and the browser inspector call. All now require `/tmp:rw,nosuid,nodev,exec,size=256m`. Builder remains 512m without `exec`; identity remains 64m without `exec`. Exact observed `.HostConfig.Tmpfs` dictionary equality remains mandatory.

No resource, deadline, mount, read-only, network, source, cohort, cache, tool, API, corpus, parity, cleanup or command behavior changes. This is a launch-profile compatibility hypothesis, not a diagnosis. Root may run one fresh complete bounded Truss lane after Sol review; no browser or product execution occurs in this derivative.
