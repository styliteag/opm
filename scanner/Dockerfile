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
    && rm -rf /var/lib/apt/lists/*

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
