# First launcher attempt — failed before H

The reviewed operator005 invocation failed with Docker exit125 before any container or public-H command ran: its writable output bind included an unsupported bare `rw` field. Complete outer capture and the exact-owned-name absence check were retained. The operator entry point also caught SystemExit, which would have misreported a successful main return; the next version corrects that separately. This attempt remains FAIL_OR_UNKNOWN, not public-consumer evidence.
