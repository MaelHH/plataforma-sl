"""Configuración de la app (variables de entorno + validación de producción).

Sigue el estándar del proyecto: un único punto de verdad para la config y un
`assert_production_ready()` que aborta el arranque si la configuración es insegura.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./plataforma_sl.db"

    secret_key: str = "CAMBIAME_clave_debil_solo_dev"
    access_token_minutes: int = 30
    refresh_token_days: int = 7

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    seed_on_startup: bool = True

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("secret_key")
    @classmethod
    def _no_empty_secret(cls, v: str) -> str:
        if not v:
            raise ValueError("SECRET_KEY no puede estar vacía")
        return v


def assert_production_ready(settings: "Settings") -> None:
    """Aborta el arranque si la configuración no es segura para producción."""
    if not settings.is_production:
        return
    problemas: list[str] = []
    if "CAMBIAME" in settings.secret_key or len(settings.secret_key) < 32:
        problemas.append("SECRET_KEY débil o por defecto")
    if "*" in settings.cors_origins:
        problemas.append("CORS con comodín '*' no permitido en producción")
    if settings.database_url.startswith("sqlite"):
        problemas.append("SQLite no debe usarse en producción (usa PostgreSQL)")
    if problemas:
        raise RuntimeError("Configuración insegura para producción: " + "; ".join(problemas))


@lru_cache
def get_settings() -> Settings:
    return Settings()
