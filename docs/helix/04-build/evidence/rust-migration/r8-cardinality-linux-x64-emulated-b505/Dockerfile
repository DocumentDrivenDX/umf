FROM --platform=linux/amd64 node:26.12.1-bookworm
ENV DEBIAN_FRONTEND=noninteractive CARGO_HOME=/opt/cargo RUSTUP_HOME=/opt/rustup PATH=/opt/cargo/bin:/usr/local/bun/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils git build-essential pkg-config libssl-dev python3 && rm -rf /var/lib/apt/lists/*
RUN set -eux; mkdir -p /usr/local/bun/bin; curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v1.4.3/bun-linux-x64.zip -o /tmp/bun.zip; unzip -q /tmp/bun.zip -d /tmp/bun; mv /tmp/bun/bun-linux-x64/bun /usr/local/bun/bin/bun; ln -s bun /usr/local/bun/bin/bunx; rm -rf /tmp/bun /tmp/bun.zip
RUN set -eux; curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.90.0 --target wasm32-unknown-unknown
RUN cargo install wasm-bindgen-cli --locked --version 0.2.100
WORKDIR /workspace
