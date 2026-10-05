# Pinned replay environment for the core native/browser checks
# (docs/helix/04-build/evidence/core-check-repair.md). Build from the repository root:
#   docker build -t umf-core-replay docker/core-replay
# Sibling oracle containers (PostgreSQL, SQL Server) are started through the host Docker socket.
FROM ubuntu:24.04
ARG BUN_VERSION=1.3.14
ARG GO_VERSION=1.27.1
ARG DOCKER_CLI_VERSION=29.4.0
ARG PLAYWRIGHT_VERSION=1.63.0
ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-arm64 PATH=/opt/venv/bin:/usr/local/go/bin:/opt/bun/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip git xz-utils build-essential pkg-config \
      python3.12 python3.12-venv python3.12-dev openjdk-21-jdk-headless flatbuffers-compiler \
    && rm -rf /var/lib/apt/lists/*
RUN set -eux; arch="$(dpkg --print-architecture)"; \
    case "$arch" in arm64) bunarch=aarch64; goarch=arm64; dockarch=aarch64;; amd64) bunarch=x64; goarch=amd64; dockarch=x86_64;; esac; \
    curl -fsSL -o /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${bunarch}.zip"; \
    unzip -q /tmp/bun.zip -d /tmp/bun; mkdir -p /opt/bun/bin; mv /tmp/bun/bun-linux-${bunarch}/bun /opt/bun/bin/bun; rm -rf /tmp/bun /tmp/bun.zip; \
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${goarch}.tar.gz" | tar -C /usr/local -xz; \
    curl -fsSL "https://download.docker.com/linux/static/stable/${dockarch}/docker-${DOCKER_CLI_VERSION}.tgz" | tar -xz -C /tmp; \
    mv /tmp/docker/docker /usr/local/bin/docker; rm -rf /tmp/docker; \
    ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")" /usr/lib/jvm/java-21-openjdk-arm64 || true
# Python: the oracle requirements plus the TableSpec/relationship probe pins named in the repair evidence.
COPY oracle-requirements.txt shacl-requirements.txt /tmp/req/
RUN python3.12 -m venv /opt/venv \
    && pip install --no-cache-dir -r /tmp/req/oracle-requirements.txt -r /tmp/req/shacl-requirements.txt \
    && pip install --no-cache-dir pydantic==2.11.10 jsonschema==4.25.1 great-expectations==1.15.1 rdflib==7.6.0 linkml-runtime==1.11.0rc2
RUN bunx playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium && rm -rf /var/lib/apt/lists/*
WORKDIR /work
