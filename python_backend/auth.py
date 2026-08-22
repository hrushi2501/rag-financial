"""Authentication boundary prepared for Supabase JWTs.

``AUTH_MODE=disabled`` is intended only for local development. In Supabase
mode, tokens are verified locally with the project's JWT secret; identity is
never accepted from request JSON or headers other than the bearer token.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache, wraps
from typing import Callable, TypeVar

from flask import current_app, g, jsonify, request

F = TypeVar("F", bound=Callable)


@dataclass(frozen=True)
class Principal:
    user_id: str
    tenant_id: str
    role: str = "authenticated"


@lru_cache(maxsize=4)
def _jwks_client(url: str):
    import jwt

    return jwt.PyJWKClient(url, cache_jwk_set=True, lifespan=600)


def _authenticate() -> Principal:
    mode = current_app.config.get("AUTH_MODE", "disabled")
    if mode == "disabled":
        return Principal(
            user_id=current_app.config.get("DEV_USER_ID", "local-user"),
            tenant_id=current_app.config.get("DEV_TENANT_ID", "local-tenant"),
            role="admin",
        )

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise PermissionError("missing bearer token")
    try:
        import jwt

        token = header.removeprefix("Bearer ").strip()
        audience = current_app.config.get("SUPABASE_JWT_AUDIENCE", "authenticated")
        issuer = current_app.config.get("SUPABASE_JWT_ISSUER") or None
        jwks_url = current_app.config.get("SUPABASE_JWKS_URL")
        if jwks_url:
            signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=audience,
                issuer=issuer,
            )
        else:
            # Compatibility for older projects. New deployments should prefer
            # asymmetric signing keys exposed through Supabase JWKS.
            secret = current_app.config.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise RuntimeError("Supabase JWT verification is not configured")
            claims = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=audience,
                issuer=issuer,
            )
    except RuntimeError:
        raise
    except Exception as exc:
        raise PermissionError("invalid or expired bearer token") from exc
    user_id = claims.get("sub")
    if not user_id:
        raise PermissionError("token has no subject")
    app_metadata = claims.get("app_metadata") or {}
    tenant_id = app_metadata.get("organization_id") or user_id
    return Principal(user_id=user_id, tenant_id=tenant_id, role=claims.get("role", "authenticated"))


def require_auth(view: F) -> F:
    @wraps(view)
    def wrapped(*args, **kwargs):
        try:
            g.principal = _authenticate()
        except PermissionError as exc:
            return jsonify({"success": False, "error": str(exc), "code": "unauthorized"}), 401
        except RuntimeError:
            current_app.logger.exception("Authentication is misconfigured")
            return jsonify({"success": False, "error": "Authentication unavailable", "code": "auth_unavailable"}), 503
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def require_admin(view: F) -> F:
    @require_auth
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.principal.role not in {"admin", "service_role"}:
            return jsonify({"success": False, "error": "Admin access required", "code": "forbidden"}), 403
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]
