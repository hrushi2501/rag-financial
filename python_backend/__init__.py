"""Financial RAG backend package."""


def create_app(*args, **kwargs):
    """Import Flask lazily so worker/domain modules stay dependency-light."""
    from .app import create_app as factory

    return factory(*args, **kwargs)


__all__ = ["create_app"]
