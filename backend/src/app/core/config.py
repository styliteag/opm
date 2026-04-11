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
    # Controls the background filler job that populates
    # `hostname_lookup_cache` from HackerTarget's /reverseiplookup/ API.
    # The cache powers the upcoming SNI-aware nuclei fan-out (Commit 5).
    hostname_lookup_enabled: bool = True
    # Free-tier API key from https://hackertarget.com/ (optional). When
    # set the filler uses the 100/day limit instead of the 50/day anon
    # limit. Empty string means anonymous mode.
    hackertarget_api_key: str = ""
    # How often the filler job runs (minutes). Lower = more responsive
    # to newly-discovered hosts, but no point going below a few minutes
    # because the daily budget is the real bottleneck.
    hostname_lookup_interval_minutes: int = 60


settings = Settings()
