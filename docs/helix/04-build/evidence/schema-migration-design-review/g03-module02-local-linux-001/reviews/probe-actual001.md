# G03 compiler probe first attempt

Disposition: FAIL_OR_UNKNOWN before any compatibility case ran. This is a retained runtime provisioning failure, not a Weft or G03 result.

Actual run directory: /private/tmp/g03-local-linux-admission-operator-001/runs/e2dbd083504c4d6e9d722cac595975e1
Operator receipt SHA-256 c5c563833bd288f25c2e155348a60d4584113ed88aa9c097d293dcd3a40ca8d3; guest receipt 4e3b5937fecc838173ca62e03e856f43edbf8637b3c12496c3c942970203b4a9. Independently verified all 20 recorded physical output rows, 168,081 bytes, with 6,513 bytes of logs. Outer elapsed 7.827 seconds; guest 6.628 seconds. No command timeout or truncation is recorded.

P commit/tree/clean checks, exact Python/Bun identities, fixture generation, hashed offline 18-package installation, pip check and installed Weft member correspondence completed with exit 0. Both Weft package members match the immutable wheel: __init__.py 99 bytes SHA cd0fa27c9580742333d14e24d5ebfd74babb47d31720bb4c577278d05486f11d; weft.abi3.so 44,241,176 bytes SHA 2f39a3e2bf356922a44fef0e88ffaae155d6d850e66d7f7e35d9209cd85c3760.

The admission process exited 1 after 0.195 seconds during import of pydantic_core: its installed native .so under /venv failed to map a shared-object segment. No five-case JSON report exists. The operator's software tmpfs execution prerequisites must be corrected before another attempt; explicit exec for the disposable /venv and /tmp software paths is a provisioning repair, not an AST, dependency, case, bound or assertion change.

Cleanup physically closed with rm exit 0, removed true and a reachable exact-name absence check true. The additional cleanup.error is a subsequent failure-path attempt to inspect an already removed container after recognizing the guest nonzero exit; it does not negate the earlier reachable absence proof. Preserve the raw record and fix only redundant re-cleanup in a new operator copy.

Any next attempt must retain this failure and run the full five-case probe fresh under separately source-reviewed corrected operator bytes. No compatibility, N12, DB behavior, full campaign or release qualification is claimed. Review used data/text/hash inspection only.
