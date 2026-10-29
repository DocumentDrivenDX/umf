# Truss008 finite tmpfs-custody correction

This fresh source derivative implements the accepted finite Sol plan `/private/tmp/g03-truss-mount-custody-sol-plan001.md` (SHA-256 `31d468bb592c68af9f63fef713e8e1beeeb12bc14a77d438bebb94102f3e2b5a`). Truss007 remains an actual `FAIL_OR_UNKNOWN`; its retained guest PASS, output artifacts and cleanup are partial observations and are not stitched into a successful successor.

The bounded `docker inspect` format now captures `.HostConfig.Tmpfs` as a separate JSON field from `.Mounts`. The inspector validates the complete bind-mount roster as before, with no tmpfs row expected in `.Mounts`; extra or missing mount rows still fail. A closed role map requires exactly one `/tmp` tmpfs entry with the argv-matched string: builder `rw,nosuid,nodev,size=512m`, identity `rw,nosuid,nodev,size=64m`, browser `rw,nosuid,nodev,size=256m`. The observed tmpfs dictionary is retained in container identity evidence. All existing image, platform, network, read-only-root, resource, status, bind ownership/mode and cleanup predicates remain unchanged.

No product source, guest checks, corpora, dependencies, commands, deadlines, caps or outputs changed. No browser or product operation ran in this derivative. The next step is Sol source review followed by a fresh complete bounded Truss lane; no metadata-only completion of007 is claimed.
