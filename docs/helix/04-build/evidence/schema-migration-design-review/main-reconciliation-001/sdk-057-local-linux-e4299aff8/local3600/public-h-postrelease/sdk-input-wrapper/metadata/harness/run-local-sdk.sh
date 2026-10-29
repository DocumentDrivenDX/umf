#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'usage: %s SOURCE_VOLUME EXPECTED_SOURCE_COMMIT OUTPUT_DIRECTORY\n' "$0" >&2
  exit 64
}

[[ $# -eq 3 ]] || usage
source_volume=$1
expected_commit=$2
output_dir=$3
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
image='sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10'
image_id=$(docker image inspect "$image" --format '{{.Id}}')
[[ "$image_id" == 'sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10' ]]
[[ "$expected_commit" =~ ^[0-9a-f]{40}$ ]]
docker volume inspect "$source_volume" >/dev/null
[[ ! -e "$output_dir" ]] || { printf 'refusing reused output directory: %s\n' "$output_dir" >&2; exit 73; }
mkdir -p -- "$output_dir"
execution_id="local-sdk-$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import uuid; print(uuid.uuid4())')-attempt1"
harness_sha=$(cd -- "$script_dir" && shasum -a 256 inside-sdk-producer.py capture-bounded-log.py run-local-sdk.sh write-launch-failure.py | shasum -a 256 | awk '{print $1}')

set +e
docker run --rm \
  --name "$execution_id" \
  --pull=never --platform linux/amd64 --network bridge \
  --cpus 4 --memory 8g --pids-limit 4096 --stop-timeout 30 \
  --mount "type=volume,src=$source_volume,dst=/source,readonly" \
  --mount "type=bind,src=$script_dir,dst=/runner,readonly" \
  --mount "type=bind,src=$output_dir,dst=/out" \
  --env "UMF_HARNESS_SHA256=$harness_sha" \
  --env "UMF_IMAGE_ID=$image_id" \
  --env "UMF_BASE_IMAGE_ID=sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556" \
  "$image" python3 /runner/inside-sdk-producer.py "$expected_commit" "$execution_id"
docker_status=$?
set -e

if [[ ! -s "$output_dir/sdk-producer-receipt.json" ]]; then
  python3 "$script_dir/write-launch-failure.py" "$output_dir/sdk-producer-receipt.json" \
    "$expected_commit" "$execution_id" "$harness_sha" "$image_id" "$docker_status"
fi

exit "$docker_status"
