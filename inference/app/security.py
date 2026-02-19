"""
Security middleware for AscultiCor Inference Service.
Includes security headers, rate limiting, and input validation.
"""

import os
import time
from typing import Dict, List, Optional, Callable
from functools import wraps
from fastapi import Request, Response, HTTPException
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    def __init__(self, app: ASGIApp, csp_policy: Optional[str] = None):
        super().__init__(app)
        self.csp_policy = csp_policy or os.getenv(
            "CSP_POLICY",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
        )
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        
        # Content Security Policy
        response.headers["Content-Security-Policy"] = self.csp_policy
        
        return response


class RateLimiter:
    """Simple in-memory rate limiter."""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, List[float]] = {}
    
    def is_allowed(self, client_id: str) -> bool:
        """Check if request is within rate limit."""
        now = time.time()
        minute_ago = now - 60
        
        # Clean old requests
        if client_id in self.requests:
            self.requests[client_id] = [
                req_time for req_time in self.requests[client_id]
                if req_time > minute_ago
            ]
        else:
            self.requests[client_id] = []
        
        # Check limit
        if len(self.requests[client_id]) >= self.requests_per_minute:
            return False
        
        # Record request
        self.requests[client_id].append(now)
        return True
    
    def reset(self, client_id: str):
        """Reset rate limit for a client."""
        self.requests.pop(client_id, None)


# Global rate limiters
rate_limiter = RateLimiter(
    requests_per_minute=int(os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "60"))
)
auth_rate_limiter = RateLimiter(
    requests_per_minute=int(os.getenv("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE", "5"))
)


def rate_limit(limit_type: str = "general"):
    """
    Decorator to apply rate limiting to endpoints.
    
    Args:
        limit_type: "general" for standard endpoints, "auth" for authentication endpoints
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request from args or kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            
            if request is None:
                request = kwargs.get('request')
            
            if request:
                client_id = request.client.host if request.client else "unknown"
                limiter = auth_rate_limiter if limit_type == "auth" else rate_limiter
                
                if not limiter.is_allowed(client_id):
                    raise HTTPException(
                        status_code=429,
                        detail="Rate limit exceeded. Please try again later."
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def validate_input(max_length: int = 1000, allowed_chars: str = None):
    """
    Decorator to validate input parameters.
    
    Args:
        max_length: Maximum length for string inputs
        allowed_chars: Regex pattern for allowed characters
    """
    import re
    
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Validate string parameters
            for key, value in kwargs.items():
                if isinstance(value, str):
                    if len(value) > max_length:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Parameter '{key}' exceeds maximum length of {max_length}"
                        )
                    
                    if allowed_chars and not re.match(allowed_chars, value):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Parameter '{key}' contains invalid characters"
                        )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator
