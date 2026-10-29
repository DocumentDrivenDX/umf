# Packaging 25.0 qualification-tool metadata control

This root-only, offline control creates a disposable private venv from the selected Linux image's CPython 3.11.17, installs only the pinned pure-Python `packaging==25.0` wheel, and runs the unchanged UMF selector against the exact frozen18 wheel metadata. The source P volume, original cohort, derived single-cell lock, runtime marker observation, and tool wheel inputs are mounted read-only. The container uses only its bounded 256 MiB `/tmp` tmpfs as executable scratch so the disposable venv interpreter can run; the tmpfs remains `nosuid,nodev` and the root filesystem stays read-only. Only the control output bind is writable; the container has no network and a read-only root filesystem.

The control checks all 23 original packaging wheel members against the static wheel audit, allowing only pip's rewritten self-RECORD and its exact INSTALLER/REQUESTED metadata. It validates every installed RECORD hash/size and independently closes the physical 25-file roster, with a 1 MiB per-file and 8 MiB total installed-packaging bound. It records the complete 11-key image marker environment without adding `extra`, validates no-extras marker evaluation, and requires the unchanged selector to reproduce all18 selected distributions and72 requirement edges. It does not install or import UMF product distributions, invoke either unchanged product probe, or qualify the held cohort.

The runtime metadata control in this folder is separate from parity016. The caller change to the combined route must wait for the metadata control's accepted actual result and a fresh Sol review. Source authoring did not run this control, Docker, tests, or product code.

After source review, run the metadata-only control with a new output directory under `/private/tmp`:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B /private/tmp/g03-sdk058-packaging-tool-control-source-004/run.py \
  --output-dir /private/tmp/g03-sdk058-packaging-tool-control-actual-002
```

A successful result is `PASS_METADATA_ONLY`; it is evidence about the isolated qualification-tool environment and unchanged metadata selector only.
