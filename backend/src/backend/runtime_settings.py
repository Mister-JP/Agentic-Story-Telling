from __future__ import annotations

from dataclasses import dataclass
import os
from threading import RLock

from backend.errors import ApiError
from backend.schemas import BackendMode, LlmProvider, LlmSettingsResponse, LlmSettingsUpdateRequest

DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_TIMEOUT_SECONDS = 120
DEFAULT_MAX_TOKENS = 8000


def normalize_base_url(base_url: str) -> str:
    return base_url.strip().rstrip("/")


def infer_provider(base_url: str) -> LlmProvider:
    normalized_base_url = normalize_base_url(base_url)
    if normalized_base_url == DEFAULT_GROQ_BASE_URL:
        return LlmProvider.GROQ
    if normalized_base_url == DEFAULT_GEMINI_BASE_URL:
        return LlmProvider.GEMINI
    return LlmProvider.CUSTOM


def parse_positive_int(value: str, *, fallback: int) -> int:
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(parsed_value, 1)


def resolve_provider_base_url(provider: LlmProvider, requested_base_url: str) -> str:
    normalized_requested_base_url = normalize_base_url(requested_base_url)
    if provider == LlmProvider.GROQ:
        return normalized_requested_base_url or DEFAULT_GROQ_BASE_URL
    if provider == LlmProvider.GEMINI:
        return normalized_requested_base_url or DEFAULT_GEMINI_BASE_URL
    return normalized_requested_base_url


@dataclass(frozen=True, slots=True)
class RuntimeLlmSettings:
    backend_mode: BackendMode
    provider: LlmProvider
    api_key: str
    model: str
    base_url: str
    timeout_seconds: int
    max_tokens: int

    def to_response(self) -> LlmSettingsResponse:
        return LlmSettingsResponse(
            backend_mode=self.backend_mode,
            provider=self.provider,
            model=self.model,
            base_url=self.base_url,
            timeout_seconds=self.timeout_seconds,
            max_tokens=self.max_tokens,
            has_api_key=bool(self.api_key),
        )


def load_env_runtime_llm_settings() -> RuntimeLlmSettings:
    raw_backend_mode = os.getenv("WORLD_MODEL_BACKEND_MODE", "stub").strip().lower()
    backend_mode = BackendMode.REAL if raw_backend_mode == BackendMode.REAL.value else BackendMode.STUB
    base_url = normalize_base_url(os.getenv("WORLD_MODEL_LLM_BASE_URL", DEFAULT_GROQ_BASE_URL))
    return RuntimeLlmSettings(
        backend_mode=backend_mode,
        provider=infer_provider(base_url),
        api_key=os.getenv("WORLD_MODEL_LLM_API_KEY", "").strip(),
        model=os.getenv("WORLD_MODEL_LLM_MODEL", "").strip(),
        base_url=base_url,
        timeout_seconds=parse_positive_int(os.getenv("WORLD_MODEL_LLM_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)), fallback=DEFAULT_TIMEOUT_SECONDS),
        max_tokens=parse_positive_int(os.getenv("WORLD_MODEL_LLM_MAX_TOKENS", str(DEFAULT_MAX_TOKENS)), fallback=DEFAULT_MAX_TOKENS),
    )


class RuntimeLlmSettingsStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._override: RuntimeLlmSettings | None = None

    def has_override(self) -> bool:
        with self._lock:
            return self._override is not None

    def get(self) -> RuntimeLlmSettings:
        with self._lock:
            return self._override or load_env_runtime_llm_settings()

    def clear(self) -> None:
        with self._lock:
            self._override = None

    def update(self, request: LlmSettingsUpdateRequest) -> RuntimeLlmSettings:
        with self._lock:
            current_settings = self._override or load_env_runtime_llm_settings()
            next_base_url = resolve_provider_base_url(request.provider, request.base_url)
            next_model = request.model.strip()
            next_api_key = request.api_key if request.api_key is not None else current_settings.api_key

            if (
                request.backend_mode == BackendMode.REAL
                and request.provider != current_settings.provider
                and request.api_key is None
            ):
                raise ApiError(
                    error="llm_configuration_error",
                    message="Enter a new API key when switching providers.",
                    status_code=400,
                    retryable=False,
                )

            if request.provider == LlmProvider.CUSTOM and next_base_url == "":
                raise ApiError(
                    error="llm_configuration_error",
                    message="A custom provider requires a base URL.",
                    status_code=400,
                    retryable=False,
                )

            if request.provider == LlmProvider.GEMINI and next_model == "":
                next_model = DEFAULT_GEMINI_MODEL

            if request.backend_mode == BackendMode.REAL:
                if next_api_key == "":
                    raise ApiError(
                        error="llm_configuration_error",
                        message="A real provider requires an API key.",
                        status_code=400,
                        retryable=False,
                    )
                if next_model == "":
                    raise ApiError(
                        error="llm_configuration_error",
                        message="A real provider requires a model name.",
                        status_code=400,
                        retryable=False,
                    )

            next_settings = RuntimeLlmSettings(
                backend_mode=request.backend_mode,
                provider=request.provider,
                api_key=next_api_key,
                model=next_model,
                base_url=next_base_url,
                timeout_seconds=request.timeout_seconds,
                max_tokens=request.max_tokens,
            )
            self._override = next_settings
            return next_settings
