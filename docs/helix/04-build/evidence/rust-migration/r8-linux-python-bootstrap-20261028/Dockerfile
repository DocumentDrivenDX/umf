ARG PYTHON_VERSION
FROM --platform=linux/amd64 umf-r8-sdk-linux-x64:latest AS rust
FROM --platform=linux/amd64 python:${PYTHON_VERSION}-slim
ARG PYTHON_VERSION
RUN case "$PYTHON_VERSION" in 3.11.17|3.12.15|3.13.16) ;; *) echo "unsupported Python version: $PYTHON_VERSION" >&2; exit 2 ;; esac \
 && apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
COPY --from=rust /opt/cargo /opt/cargo
COPY --from=rust /opt/rustup /opt/rustup
ENV CARGO_HOME=/opt/cargo RUSTUP_HOME=/opt/rustup PATH=/opt/cargo/bin:${PATH}
RUN python -m pip install --no-cache-dir \
    build==1.3.0 hatchling==1.27.0 twine==6.2.0 \
    pydantic==2.11.9 pytest==8.4.2 \
 && python -c 'import platform,sys; print(platform.machine(), sys.version)' \
 && rustc --version \
 && cargo --version \
 && python -m pip check
