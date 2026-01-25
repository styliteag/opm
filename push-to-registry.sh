#!/bin/bash

# Open Port Monitor Docker Registry Push Script with Multi-Architecture Support

set -e

# Configuration
REGISTRY_URL="${DOCKER_REGISTRY:-docker.io}"  # Default to Docker Hub
NAMESPACE="${DOCKER_NAMESPACE:-styliteag}"  # Change this to your username/organization

# Parse command line arguments
ARCH_ARG="${1:-auto}"

# Function to show usage
show_usage() {
    echo "Usage: $0 [ARCHITECTURE]"
    echo ""
    echo "ARCHITECTURE options:"
    echo "  auto    - Build AMD64 always, ARM64 only if on ARM64 system (default)"
    echo "  all     - Build both AMD64 and ARM64"
    echo "  amd64   - Build AMD64 only"
    echo "  arm64   - Build ARM64 only"
    echo ""
    echo "Examples:"
    echo "  $0          # Auto-detect (default behavior)"
    echo "  $0 all      # Build both architectures"
    echo "  $0 amd64    # Build AMD64 only"
    echo "  $0 arm64    # Build ARM64 only"
    exit 1
}

# Validate architecture argument
case "$ARCH_ARG" in
    auto|all|amd64|arm64)
        ;;
    help|--help|-h)
        show_usage
        ;;
    *)
        echo "❌ Invalid architecture argument: $ARCH_ARG"
        echo ""
        show_usage
        ;;
esac

# Read version from VERSION file
if [ -f "VERSION" ]; then
    VERSION=$(cat "VERSION" | tr -d '\n\r ')
    VERSION_TAG="${VERSION}"
else
    VERSION="unknown"
    VERSION_TAG="latest"
fi

echo "🚀 Building and pushing Open Port Monitor images to registry..."
echo "Registry: ${REGISTRY_URL}"
echo "Namespace: ${NAMESPACE}"
echo "Version Tag: ${VERSION_TAG}"
echo "Architecture Mode: ${ARCH_ARG}"
echo ""

# Create and use a multi-platform builder if it doesn't exist
BUILDER_NAME="opm-builder"
if ! docker buildx inspect $BUILDER_NAME >/dev/null 2>&1; then
    echo "🔨 Creating multi-platform builder: $BUILDER_NAME"
    docker buildx create --name $BUILDER_NAME --use
else
    echo "🔨 Using existing multi-platform builder: $BUILDER_NAME"
    docker buildx use $BUILDER_NAME
fi

# Determine build platforms based on argument
case "$ARCH_ARG" in
    auto)
        PLATFORMS="linux/amd64"
        CURRENT_ARCH=$(uname -m)
        if [[ "$CURRENT_ARCH" == "arm64" || "$CURRENT_ARCH" == "aarch64" ]]; then
            PLATFORMS="linux/amd64,linux/arm64"
            echo "🏗️  Building for AMD64 and ARM64 (detected ARM64 system)"
        else
            echo "🏗️  Building for AMD64 only (detected non-ARM64 system)"
        fi
        ;;
    all)
        PLATFORMS="linux/amd64,linux/arm64"
        echo "🏗️  Building for AMD64 and ARM64 (forced)"
        ;;
    amd64)
        PLATFORMS="linux/amd64"
        echo "🏗️  Building for AMD64 only (forced)"
        ;;
    arm64)
        PLATFORMS="linux/arm64"
        echo "🏗️  Building for ARM64 only (forced)"
        ;;
esac

# Build and push images
echo "Platforms: $PLATFORMS"
echo ""

# Combined App (frontend + backend)
echo "📦 Building combined app (frontend + backend)..."
docker buildx build \
    --platform $PLATFORMS \
    --build-arg VERSION=${VERSION} \
    --tag ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor:${VERSION_TAG} \
    --tag ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor:latest \
    --file Dockerfile \
    --push \
    .

# Scanner
echo "📦 Building scanner..."
docker buildx build \
    --platform $PLATFORMS \
    --build-arg VERSION=${VERSION} \
    --tag ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor-scanner:${VERSION_TAG} \
    --tag ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor-scanner:latest \
    --file scanner/Dockerfile \
    --push \
    scanner

echo ""
echo "✅ Images built and pushed successfully!"
echo ""
echo "📋 Image URLs:"
echo "   App:     ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor:${VERSION_TAG}"
echo "   Scanner: ${REGISTRY_URL}/${NAMESPACE}/open-port-monitor-scanner:${VERSION_TAG}"
echo ""
echo "🏗️  Built architectures:"
case "$PLATFORMS" in
    *amd64*arm64*|*arm64*amd64*)
        echo "   - linux/amd64 (x86_64)"
        echo "   - linux/arm64 (ARM64)"
        ;;
    *amd64*)
        echo "   - linux/amd64 (x86_64)"
        ;;
    *arm64*)
        echo "   - linux/arm64 (ARM64)"
        ;;
esac