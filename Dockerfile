FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM rust:1.85-bookworm AS server
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY .cargo/ .cargo/
COPY server/ server/
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN groupadd --system moodcast && useradd --system --gid moodcast moodcast \
    && mkdir -p /app/data && chown moodcast:moodcast /app/data
WORKDIR /app
COPY --from=server /app/target/release/moodcast /usr/local/bin/moodcast
COPY --from=web /build/web/dist /app/web/dist
ENV MOODCAST_BIND=0.0.0.0:3000
ENV DATABASE_URL=sqlite:///app/data/moodcast.db
ENV WEB_DIST=/app/web/dist
USER moodcast
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["moodcast"]
