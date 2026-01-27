# Open Port Monitor Documentation

Welcome to the Open Port Monitor documentation. This guide covers the API reference, scanner deployment, and development resources.

## Table of Contents

### API Reference

Complete API documentation for integrating with Open Port Monitor.

- [API Overview](api/overview.md) - Base URL, error handling, pagination, and authentication patterns
- [Authentication](api/authentication.md) - User and scanner authentication flows
- [Networks](api/networks.md) - Network management CRUD operations
- [Alerts](api/alerts.md) - Alert management, acknowledgment, and export
- [Hosts](api/hosts.md) - Host management and export
- [Scans](api/scans.md) - Scan details, results, and logs
- [Trends](api/trends.md) - Historical trend data
- [Scanner API](api/scanner-api.md) - Scanner-to-backend protocol for custom scanners
- [Users](api/users.md) - User management
- [Global Ports](api/global-ports.md) - Global port rules

### Scanner Documentation

Guides for deploying and operating scanner agents.

- [Deployment Guide](scanner/deployment.md) - Docker deployment and configuration
- [Architecture](scanner/architecture.md) - How the scanner agent works internally
- [Troubleshooting](scanner/troubleshooting.md) - Common issues and solutions

### Development

Resources for contributors and developers.

- [Setup Guide](development/setup.md) - Development environment setup
- [Architecture Overview](development/architecture.md) - System architecture and design
- [Contributing](development/contributing.md) - Code standards and PR process

## Quick Links

- [Main README](../README.md) - Project overview and quick start
- [API Docs (Swagger)](http://localhost:8000/docs) - Interactive API documentation (when running locally)
- [Changelog](../CHANGELOG.md) - Release history
