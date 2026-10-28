ARG PYTHON_VERSION
FROM python:${PYTHON_VERSION}-slim-bookworm
ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_HOME=/opt/rustup \
    CARGO_HOME=/opt/cargo \
    PATH=/opt/cargo/bin:/usr/local/bin:/usr/bin:/bin
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl pkg-config && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.90.0
RUN python -m pip install --no-cache-dir maturin==1.9.6 pytest==8.4.2
RUN python --version && rustc --version && cargo --version && maturin --version && pytest --version
