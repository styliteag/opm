# Pinned upstream nuclei image — used as a multi-stage source for the
# statically-linked nuclei binary. Bump the tag to update nuclei.
ARG NUCLEI_VERSION=v3.7.1
FROM projectdiscovery/nuclei:${NUCLEI_VERSION} AS nuclei

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    masscan \
    nmap \
    iputils-ping \
    tcpdump \
    iproute2 \
    net-tools \
    dnsutils \
    traceroute \
    netcat-openbsd \
    curl \
    wget \
    procps \
    psmisc \
    socat \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Nuclei binary (pinned via NUCLEI_VERSION arg above) + community templates.
# Templates are refreshed at Docker build time via `nuclei -update-templates`;
# runtime updates are disabled inside the scanner via `-disable-update-check`
# so a running container never drifts.
COPY --from=nuclei /usr/local/bin/nuclei /usr/local/bin/nuclei
ENV NUCLEI_TEMPLATES_DIR=/opt/nuclei-templates
RUN mkdir -p "${NUCLEI_TEMPLATES_DIR}" \
    && nuclei -update-templates -ud "${NUCLEI_TEMPLATES_DIR}" -duc \
    && chmod -R a+rX "${NUCLEI_TEMPLATES_DIR}"

RUN mkdir -p /opt/opm/custom-scripts

ENV TZ=UTC

RUN pip install uv ssh-audit

COPY pyproject.toml ./
COPY uv.lock* ./

RUN uv sync --frozen || uv sync

COPY src ./src

ARG VERSION=unknown
ENV APP_VERSION=${VERSION}
# Create VERSION file from build arg (baked at build time) - LAST STEP for better caching
# Scanner code reads version from /app/VERSION file
RUN echo "${VERSION:-unknown}" > /app/VERSION

CMD ["uv", "run", "python", "-m", "src.main"]
