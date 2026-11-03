# Recovered document-comparison wire controls

The October snapshot retains escaped JSON-pointer and explicit-cancellation wire
controls beyond the current inline checks. The restored integration test keeps
those vectors and uses the current UTF-16 error envelope. Runtime code is unchanged.

[Receipt](receipt.json) records the unqualified local attempt. The bounded probe
compiled dependencies and was stopped to yield the shared machine to the frozen
0.10.7 release builds. No pass is claimed; the snapshot remains protected until
this test is verified and integrated.

The current staged Lakeview workflow explicitly runs this integration target.
A later local Cargo attempt stopped in a dependency build before executing tests;
its attempted registry write was refused and the pristine dependency digest is
unchanged. A direct retained-dependency probe also executed no test. These are
recorded attempts, not product failures or qualification. Final cohort CI must
compile and execute the recovered controls.
