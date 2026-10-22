import os


def getenv(key: str, default: str) -> str:
    v = os.environ.get(key)
    return v if v is not None and v != "" else default


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url and url.strip():
        return url
    user = getenv("POSTGRES_USER", "postgres")
    password = getenv("POSTGRES_PASSWORD", "postgres")
    host = getenv("POSTGRES_HOST", "127.0.0.1")
    port = getenv("POSTGRES_PORT", "5432")
    db = getenv("POSTGRES_DB", "app")
    return f"postgres://{user}:{password}@{host}:{port}/{db}"


def load_config() -> tuple[str, int]:
    host = getenv("HOST", "127.0.0.1")
    port_str = getenv("PORT", "3005")
    try:
        port = int(port_str)
    except ValueError:
        port = 3005
    return host, port
