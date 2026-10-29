# Local public-H Docker operator — initial source findings

HELD pending narrow source corrections to runner bb915412a3586fb93fabda96267882bb58727447c3a6ffc54bd75c33ada79206. This is source review only; no Docker/image inspection or execution occurred.

The proposed exact7e44 Linuxamd64 image, specific read-only evidence/source mounts, one writable output, unchanged seven reader commands and1800/180/60/10 reader bounds are appropriate. Separate outer1800 watchdog/10 stop,128KiB stream/256KiB capture,1MiB wrapper metadata,4CPU/8GiB/8192PIDs are honestly labeled operator provisions. Existing bridge access is required for original public acquisition and locked install; the proposal does not enforce a network-host allowlist and should not claim one.

Concrete blockers sent as one correction batch:

1. Ensure cleanup and durable failure result on every post-launch exception. Current capture/read/write/Popen/wait exceptions escape before owned cleanup. Use an outer try/finally around launched-container lifetime and record failure without a false cleanup pass.
2. Stat input JSON before read and selected evidence before hash. Require bounded regular nonsymlink files, closed family and total<=16MiB before hashing/reading the selected roster. Current checks occur after unbounded reads/hashes. Receipt parsing and its final SHA need the same bounded-family protection.
3. Hard-pin the independently reviewed reader SHA5feed5ed5516b73838650b7c42e9121839e970cee130e49f1f7f479069f9938f in the operator, then require both physical reader and packet binding to equal it. Caller packet equality alone does not freeze reviewed source.
4. Reject symlink components/canonical path mismatch before constructing input mounts; current resolve+physical mount changes paths while packet strings remain unchanged. Reject output/input ancestor overlaps so read-only input mounts cannot hide the writable output or expose mutable inputs.
5. Bound capture-drain completion after deadline even if the Docker client has already exited but inherited streams remain open. The current deadline branch only applies while poll() is None. Capture failures/truncation must fail closed.
6. Recheck final wrapper-family byte cap after updating operator-run.json with result status/hash; the current cap check precedes that final growth.

No change is requested to reader commands, public asset/source/tag checks, SDK139/full18, D5 profile semantics, sourceP, image or actual qualification requirements. Current held packet must remain nonlaunchable. Final corrected source requires a narrow closure review before publication-time execution; no rerun of accepted SDK/full18 evidence is warranted.
