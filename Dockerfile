ARG RUNTIME_BASE=zhangchaobab/niuzios
ARG TARGETARCH=arm64

FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM rust:1.85-alpine AS server
ARG TARGETARCH
RUN apk add --no-cache build-base
ENV RUSTFLAGS="-C target-feature=+crt-static"
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY .cargo/ .cargo/
COPY server/ server/
RUN case "$TARGETARCH" in \
      amd64) RUST_TARGET=x86_64-unknown-linux-musl ;; \
      arm64) RUST_TARGET=aarch64-unknown-linux-musl ;; \
      *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; \
    esac \
    && cargo build --release --locked --target "$RUST_TARGET" \
    && cp "target/$RUST_TARGET/release/moodcast" /app/moodcast

FROM ${RUNTIME_BASE}:micro-${TARGETARCH}
RUN mkdir -p /app/data && chown 10001:10001 /app/data
WORKDIR /app
COPY --from=server /app/moodcast /usr/local/bin/moodcast
COPY --from=web /build/web/dist /app/web/dist
ENV MOODCAST_BIND=0.0.0.0:3000
ENV DATABASE_URL=sqlite:///app/data/moodcast.db
ENV WEB_DIST=/app/web/dist
ENV MUSIC_DIR=/app/data/music
USER 10001:10001
EXPOSE 3000
VOLUME ["/app/data"]
STOPSIGNAL SIGINT
CMD ["/usr/local/bin/moodcast"]
