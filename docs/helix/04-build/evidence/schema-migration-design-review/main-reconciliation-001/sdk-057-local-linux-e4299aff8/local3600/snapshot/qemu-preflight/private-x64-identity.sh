#!/bin/bash
set -euo pipefail
printf 'OUTER_ARCH=%s\n' "$(uname -m)"
printf 'OUTER_BINFMTNS=%s\n' "$(readlink /proc/self/ns/mnt)"
unshare --user --map-root-user --mount /bin/bash -c '
set -euo pipefail
mount --make-rprivate /
D=$(mktemp -d)
cleanup(){ umount "$D" 2>/dev/null || true; rmdir "$D" 2>/dev/null || true; }
trap cleanup EXIT
mount -t binfmt_misc binfmt_misc "$D"
mount --make-private "$D"
printf "USERNS=%s\\n" "$(readlink /proc/self/ns/user)"
printf "MOUNTNS=%s\\n" "$(readlink /proc/self/ns/mnt)"
printf "MOUNTID=%s\\n" "$(stat -c %d:%i "$D")"
printf "UIDMAP\\n"; cat /proc/self/uid_map
printf "MOUNTINFO\\n"; grep binfmt_misc /proc/self/mountinfo
printf "PRIVATE_BEFORE\\n"; find "$D" -maxdepth 1 -type f -printf "%f\\n" | sort
printf "%s\\n" ":codex_qemu_x86_64_private:M::\\x7f\\x45\\x4c\\x46\\x02\\x01\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x02\\x00\\x3e\\x00:\\xff\\xff\\xff\\xff\\xff\\xfe\\xfe\\xfc\\xff\\xff\\xff\\xff\\xff\\xff\\xff\\xff\\xfe\\xff:/opt/operator/qemu-x86_64-static:OPF" > "$D/register"
test -f "$D/codex_qemu_x86_64_private"
printf "PRIVATE_HANDLER\\n"; cat "$D/codex_qemu_x86_64_private"
PY=/opt/hostedtoolcache/Python/3.11.17/x64/bin/python3.11
test -x "$PY"
printf "GUEST_PYTHON=%s\\n" "$PY"
"$PY" -c '\''import json, os, platform, sys, time; print("GUEST_IDENTITY="+json.dumps({"machine":platform.machine(),"sysExecutable":sys.executable,"procExe":os.readlink("/proc/self/exe"),"procMapsQemu":[x.strip() for x in open("/proc/self/maps") if "qemu-x86_64" in x]},sort_keys=True),flush=True); time.sleep(12)'\'' &
P=$!
printf "GUEST_PID=%s\\n" "$P"
wait "$P"
printf "NESTED_PROBE_DONE=1\\n"
sleep 8
'
