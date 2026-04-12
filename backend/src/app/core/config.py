"""Application configuration using pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "mysql+aiomysql://opm:opm_password@localhost:3306/opm_db"

    # JWT Authentication
    jwt_secret: str = "changeme-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 480

    # Admin user (created on startup if not exists)
    admin_email: str = "admin@example.com"
    admin_password: str = "changeme"

    # SMTP Settings for email alerts
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_address: str = ""
    smtp_use_tls: bool = True
    alert_email_recipients: str = ""
    web_ui_url: str = "http://localhost:5173"

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Application
    debug: bool = False
    database_echo: bool = False

    # Timezone for cron schedules (e.g., "Europe/Berlin", "America/New_York")
    # Defaults to server's local timezone if not set
    schedule_timezone: str = ""

    # --- Hostname lookup cache (reverse-IP vhost discovery) ------------
    # Reported to the scanner via GET /api/scanner/hostname-budget and
    # used by the admin /status dashboard to label per-source limits.
    # Enrichment itself lives in the scanner now — the 2.2.0 backend
    # filler was removed in 2.3.0 (Plan C scanner-centric refactor).
    #
    # Free-tier API key from https://hackertarget.com/ (optional). When
    # set the budget endpoint reports 100/day instead of the 50/day
    # anonymous limit. Empty string means anonymous mode. Ultimately
    # this moves to scanner config; for now the backend is the source
    # of truth so a single admin can tune both budget endpoints and
    # status dashboard from one env file.
    hackertarget_api_key: str = ""
    # RapidDNS fallback: budget cap reported to the scanner. Daily
    # limit is undocumented by rapiddns; default 100 is conservative.
    # Set rapiddns_enabled=false to surface a zero budget so the
    # scanner skips the source entirely.
    rapiddns_enabled: bool = True
    rapiddns_daily_limit: int = 100


settings = Settings()
