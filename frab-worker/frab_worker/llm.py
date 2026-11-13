"""LLM client abstraction (Phase 1).

The worker must run identically whether or not a live model endpoint is
available. So agents depend on the `LLMClient` interface, and we provide:

  * OfflineLLMClient  — deterministic, no network. Generates narratives directly
                        from the structured facts it is given. This is the
                        default and powers all tests + the reproducible demo
                        mode. It never fabricates numbers; it only phrases the
                        facts handed to it.
  * ZeroGClient       — 0G Private Computer (OpenAI-compatible Router) with the
                        Private trust mode enforced on EVERY request. The
                        production inference provider.
  * MockInferenceClient — scripted, network-free stand-in for ZeroGClient. Lets
                        the agentic workflow and the frontend run end to end
                        without spending any inference credits.
  * VLLMClient        — legacy: a vLLM OpenAI-compatible endpoint serving Gemma.
  * AttestedGemmaClient — legacy/stretch: Confidential Space + attested TLS.

Provider selection (see get_client): LLM_PROVIDER, falling back to the legacy
FRAB_LLM variable, defaulting to offline.

Because the deterministic layer (features, scoring, patterns) is the source of
truth, the LLM is only ever asked to NARRATE and PHRASE. That keeps the system
correct even in offline mode and honest even in online mode.

`generate_json` wraps a client with JSON extraction + schema validation +
a bounded repair/retry loop so a malformed model response never propagates.
"""

from __future__ import annotations

import json
import logging
import os
import re
import socket
import threading
import urllib.error
import urllib.request
from urllib.parse import urlparse
from typing import Any, Callable, Protocol

logger = logging.getLogger("frab_worker.llm")


class LLMError(RuntimeError):
    pass


class LLMUnavailable(LLMError):
    """Raised when a live endpoint was requested but cannot be reached."""


class LLMConfigError(LLMError):
    """Inference is misconfigured (missing key/model, non-private trust mode...).

    Raised at client construction. Never swallowed into a silent fallback.
    """


class LLMProviderError(LLMError):
    """The inference provider rejected or failed a request.

    Carries a stable `code`, the HTTP status and the provider's request id so
    the failure can be surfaced to analysts and quoted to the provider. Messages
    never contain the API key, the prompt or the model's response.
    """

    code = "provider_error"

    def __init__(self, message: str, *, code: str | None = None,
                 http_status: int | None = None, request_id: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code
        self.http_status = http_status
        self.request_id = request_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": type(self).__name__,
            "code": self.code,
            "message": str(self),
            "http_status": self.http_status,
            "request_id": self.request_id,
        }


class LLMAuthError(LLMProviderError):
    """Invalid, missing, revoked or unauthorised API key (HTTP 401 / 403)."""
    code = "auth_error"


class LLMInsufficientBalance(LLMProviderError):
    """Not enough credits to run the request (HTTP 402)."""
    code = "insufficient_balance"


class LLMModelUnavailable(LLMProviderError):
    """The configured model does not exist / is not available to this account."""
    code = "model_unavailable"


class LLMNoPrivateProvider(LLMProviderError):
    """No healthy provider satisfies the Private trust mode (HTTP 503).

    The request is NOT downgraded to a lower trust tier.
    """
    code = "no_available_provider"


class LLMRateLimited(LLMProviderError):
    """Rate limit exceeded (HTTP 429). `retry_after` is in seconds when known."""
    code = "rate_limit_exceeded"

    def __init__(self, message: str, *, retry_after: float | None = None, **kw: Any) -> None:
        super().__init__(message, **kw)
        self.retry_after = retry_after


class LLMTimeout(LLMProviderError):
    """The request timed out."""
    code = "timeout"


class LLMInvalidResponse(LLMProviderError):
    """The provider answered, but the response body was unusable."""
    code = "invalid_response"


class LLMClient(Protocol):
    name: str

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        ...


# --------------------------------------------------------------------------
# Offline deterministic client
# --------------------------------------------------------------------------

class OfflineLLMClient:
    """Deterministic, network-free client.

    It does NOT run a model. Instead each agent, when offline, passes a
    pre-built structured "brief" and the client returns a stable JSON string
    assembled from that brief. This makes offline runs fully reproducible and
    guarantees the narrative never contradicts the deterministic facts.

    Agents call `complete()` with a prompt that already embeds a JSON block
    tagged `<<FACTS>>...<<END>>`; offline mode simply echoes that block back as
    the response body. Online mode ignores the tag and asks the real model.
    """

    name = "offline"

    _FACTS_RE = re.compile(r"<<FACTS>>(.*?)<<END>>", re.DOTALL)

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        m = self._FACTS_RE.search(prompt)
        if not m:
            # No structured brief supplied: return an empty JSON object so the
            # caller's validator drives a graceful fallback rather than a crash.
            return "{}"
        return m.group(1).strip()


# --------------------------------------------------------------------------
# 0G Private Computer (OpenAI-compatible Router) — production provider
# --------------------------------------------------------------------------

ZG_DEFAULT_BASE_URL = "https://router-api.0g.ai/v1"
ZG_TRUST_MODE_PRIVATE = "private"
_ZG_TRUST_HEADER = "X-0G-Provider-Trust-Mode"
_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow redirects: urllib would forward the Authorization header to
    the redirect target. A redirect from the Router is treated as an error."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


def _env_float(name: str) -> float | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise LLMConfigError(f"{name} must be a number.") from exc
    if value != value or value in (float("inf"), float("-inf")) or value < 0:
        raise LLMConfigError(f"{name} must be a finite, non-negative number.")
    return value


def _truthy(raw: str) -> bool:
    return raw.strip().lower() in ("1", "true", "yes", "on")


class ZeroGClient:
    """Client for 0G Private Computer's OpenAI-compatible Router.

    Guarantees:
      * Every request carries `X-0G-Provider-Trust-Mode: private`. The value is a
        constant, not read from the request path, and construction REFUSES any
        other ZG_TRUST_MODE, so there is no path that downgrades privacy.
      * No automatic retries. One call to complete() is at most one HTTP request
        (the Router may still fail over between private providers unless
        ZG_ALLOW_FALLBACKS=false).
      * No startup or connectivity probes. Construction performs no I/O.
      * Redirects are never followed (the key would be forwarded).
      * The API key, prompts and responses are never logged.

    Configuration (environment):
        ZG_API_KEY                 required, secret ("sk-...")
        ZG_MODEL                   required, exact model id for your account
        ZG_BASE_URL                default https://router-api.0g.ai/v1
        ZG_TRUST_MODE              must be "private" (default)
        ZG_TIMEOUT_SECONDS         default 60
        ZG_ALLOW_FALLBACKS         optional true|false (Router provider failover)
        ZG_MAX_PRICE_USD_PROMPT    optional price ceiling, USD per 1M tokens
        ZG_MAX_PRICE_USD_COMPLETION optional price ceiling, USD per 1M tokens
        LLM_MAX_OUTPUT_TOKENS      default 1024, applied to every request
        LLM_TEMPERATURE            optional; overrides the caller's temperature
    """

    name = "0g"

    def __init__(self) -> None:
        self._api_key = os.environ.get("ZG_API_KEY", "").strip()
        self.model = os.environ.get("ZG_MODEL", "").strip()
        self.base_url = (os.environ.get("ZG_BASE_URL", "").strip()
                         or ZG_DEFAULT_BASE_URL).rstrip("/")
        trust = (os.environ.get("ZG_TRUST_MODE", "").strip().lower()
                 or ZG_TRUST_MODE_PRIVATE)

        if trust != ZG_TRUST_MODE_PRIVATE:
            raise LLMConfigError(
                "ZG_TRUST_MODE must be 'private'. FRAB never sends inference "
                "requests under a weaker trust mode.")
        if not self._api_key:
            raise LLMConfigError("ZG_API_KEY is not set.")
        if not self.model:
            raise LLMConfigError(
                "ZG_MODEL is not set. Set the exact model id your 0G account can "
                "use under Private trust mode.")
        parsed = urlparse(self.base_url)
        if parsed.scheme != "https" and not (
                parsed.scheme == "http" and (parsed.hostname or "") in _LOOPBACK_HOSTS):
            raise LLMConfigError("ZG_BASE_URL must be https.")

        try:
            self.timeout = float(os.environ.get("ZG_TIMEOUT_SECONDS", "").strip() or 60)
            self.max_output_tokens = int(
                os.environ.get("LLM_MAX_OUTPUT_TOKENS", "").strip() or 1024)
        except ValueError as exc:
            raise LLMConfigError(
                "ZG_TIMEOUT_SECONDS / LLM_MAX_OUTPUT_TOKENS must be numbers.") from exc
        if self.timeout <= 0 or self.max_output_tokens <= 0:
            raise LLMConfigError(
                "ZG_TIMEOUT_SECONDS and LLM_MAX_OUTPUT_TOKENS must be positive.")

        self.temperature = _env_float("LLM_TEMPERATURE")
        self.max_price_prompt = _env_float("ZG_MAX_PRICE_USD_PROMPT")
        self.max_price_completion = _env_float("ZG_MAX_PRICE_USD_COMPLETION")
        fb = os.environ.get("ZG_ALLOW_FALLBACKS", "").strip()
        self.allow_fallbacks: bool | None = _truthy(fb) if fb else None

        self._opener = urllib.request.build_opener(_NoRedirect)
        self._lock = threading.Lock()
        self._usage: dict[str, Any] = {
            "calls": 0, "prompt_tokens": 0, "completion_tokens": 0,
            "total_tokens": 0, "cost_usd": None, "cost_is_estimate": False,
        }

    def __repr__(self) -> str:  # never reveal the key
        return f"ZeroGClient(model={self.model!r}, base_url={self.base_url!r})"

    # --- request building --------------------------------------------------

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
            _ZG_TRUST_HEADER: ZG_TRUST_MODE_PRIVATE,
        }
        if self.allow_fallbacks is not None:
            headers["X-0G-Provider-Allow-Fallbacks"] = (
                "true" if self.allow_fallbacks else "false")
        if self.max_price_prompt is not None:
            headers["X-0G-Provider-Max-Price-Usd-Prompt"] = str(self.max_price_prompt)
        if self.max_price_completion is not None:
            headers["X-0G-Provider-Max-Price-Usd-Completion"] = str(
                self.max_price_completion)
        return headers

    # --- inference ---------------------------------------------------------

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = json.dumps({
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature if self.temperature is not None else temperature,
            # the configured cap is authoritative: it bounds spend per call
            "max_tokens": self.max_output_tokens,
            "stream": False,
        }).encode("utf-8")

        headers = self._headers()
        assert headers[_ZG_TRUST_HEADER] == ZG_TRUST_MODE_PRIVATE  # never downgrade
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions", data=payload,
            headers=headers, method="POST")

        try:
            with self._opener.open(req, timeout=self.timeout) as resp:
                raw = resp.read()
                header_request_id = resp.headers.get("x-request-id")
        except urllib.error.HTTPError as exc:
            raise self._map_http_error(exc) from None
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                raise self._failure(LLMTimeout(
                    f"0G request timed out after {self.timeout:g}s.")) from None
            raise self._failure(LLMProviderError(
                "Could not reach the 0G Router (network error).",
                code="network_error")) from None
        except (socket.timeout, TimeoutError):
            raise self._failure(LLMTimeout(
                f"0G request timed out after {self.timeout:g}s.")) from None
        except OSError:
            raise self._failure(LLMProviderError(
                "Could not reach the 0G Router (network error).",
                code="network_error")) from None

        return self._parse_success(raw, header_request_id)

    # --- response handling -------------------------------------------------

    def _parse_success(self, raw: bytes, header_request_id: str | None) -> str:
        try:
            body = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise self._failure(LLMInvalidResponse(
                "0G returned a response that is not valid JSON.",
                request_id=header_request_id)) from None
        if not isinstance(body, dict):
            raise self._failure(LLMInvalidResponse(
                "0G returned an unexpected response shape.",
                request_id=header_request_id))

        request_id = body.get("request_id") or body.get("id") or header_request_id
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise self._failure(LLMInvalidResponse(
                "0G response had no choices[0].message.content.",
                request_id=request_id)) from None
        if not isinstance(content, str) or not content.strip():
            raise self._failure(LLMInvalidResponse(
                "0G response contained no text.", request_id=request_id))

        self._record_usage(body, request_id)
        return content

    def _record_usage(self, body: dict[str, Any], request_id: Any) -> None:
        raw_usage = body.get("usage")
        usage: dict[str, Any] = raw_usage if isinstance(raw_usage, dict) else {}
        pt = int(usage.get("prompt_tokens") or 0)
        ct = int(usage.get("completion_tokens") or 0)
        tt = int(usage.get("total_tokens") or (pt + ct))

        cost = usage.get("cost", body.get("cost"))
        is_estimate = False
        if not isinstance(cost, (int, float)) or isinstance(cost, bool):
            cost = None
            # no cost from the provider: derive an UPPER BOUND from the price
            # ceilings, if the operator configured them
            if self.max_price_prompt is not None or self.max_price_completion is not None:
                cost = ((pt * (self.max_price_prompt or 0.0))
                        + (ct * (self.max_price_completion or 0.0))) / 1_000_000
                is_estimate = True

        with self._lock:
            u = self._usage
            u["calls"] += 1
            u["prompt_tokens"] += pt
            u["completion_tokens"] += ct
            u["total_tokens"] += tt
            if cost is not None:
                u["cost_usd"] = round((u["cost_usd"] or 0.0) + cost, 8)
                u["cost_is_estimate"] = u["cost_is_estimate"] or is_estimate

        logger.info(
            "0g inference ok model=%s request_id=%s prompt_tokens=%s "
            "completion_tokens=%s total_tokens=%s cost_usd=%s%s",
            self.model, request_id, pt, ct, tt,
            "unknown" if cost is None else f"{cost:.8f}",
            " (estimated upper bound)" if is_estimate else "")

    def usage_summary(self) -> dict[str, Any]:
        """Cumulative usage for this client instance (metadata only)."""
        with self._lock:
            return dict(self._usage)

    # --- error mapping -----------------------------------------------------

    def _failure(self, exc: LLMProviderError) -> LLMProviderError:
        logger.warning("0g inference failed model=%s code=%s http_status=%s request_id=%s",
                       self.model, exc.code, exc.http_status, exc.request_id)
        return exc

    def _map_http_error(self, exc: urllib.error.HTTPError) -> LLMProviderError:
        status = exc.code
        try:
            parsed = json.loads(exc.read(65536) or b"{}")
        except Exception:  # noqa: BLE001 - an unreadable error body is fine
            parsed = {}
        body = parsed if isinstance(parsed, dict) else {}
        raw_err = body.get("error")
        err: dict[str, Any] = raw_err if isinstance(raw_err, dict) else {}
        code = str(err.get("code") or "")
        detail = str(err.get("message") or "")[:300]
        hdrs = exc.headers
        request_id = body.get("request_id") or (
            hdrs.get("x-request-id") if hdrs is not None else None)
        err_code = code or None

        if status in (401, 403) or code in (
                "invalid_api_key", "api_key_revoked", "missing_authorization",
                "api_key_not_found", "access_denied"):
            mapped: LLMProviderError = LLMAuthError(
                "0G rejected the API key (invalid, revoked, or not permitted). "
                "Check ZG_API_KEY.",
                code=err_code, http_status=status, request_id=request_id)
        elif status == 402 or code == "insufficient_balance":
            mapped = LLMInsufficientBalance(
                "0G balance is insufficient for this request. Deposit more "
                "credits; the request was not retried.",
                code=err_code, http_status=status, request_id=request_id)
        elif status == 429:
            retry_after: float | None = None
            try:
                retry_after = float((hdrs.get("Retry-After") if hdrs is not None else "") or "")
            except ValueError:
                retry_after = None
            wait = f" Retry after {retry_after:g}s." if retry_after is not None else ""
            mapped = LLMRateLimited(
                f"0G rate limit exceeded.{wait} The request was not retried.",
                retry_after=retry_after,
                code=err_code, http_status=status, request_id=request_id)
        elif status == 503 or code == "no_available_provider":
            mapped = LLMNoPrivateProvider(
                f"No healthy private (TEE) provider is available for model "
                f"'{self.model}'. The request was NOT downgraded to a lower trust "
                "tier. Try again later or choose a model offered under Private "
                "trust mode.",
                code=err_code, http_status=status, request_id=request_id)
        elif code == "invalid_trust_mode":
            mapped = LLMProviderError(
                "0G rejected the trust-mode header.",
                code=code, http_status=status, request_id=request_id)
        elif status in (400, 404) and (
                "model" in code or "model" in detail.lower() or status == 404):
            mapped = LLMModelUnavailable(
                f"Model '{self.model}' is not available to this account under "
                f"Private trust mode. Check ZG_MODEL. ({detail or code or status})",
                code=err_code, http_status=status, request_id=request_id)
        elif status == 502:
            mapped = LLMProviderError(
                "0G providers returned an error (failover exhausted).",
                code=code or "provider_error", http_status=status, request_id=request_id)
        else:
            mapped = LLMProviderError(
                f"0G request failed with HTTP {status}"
                f"{': ' + detail if detail else ''}.",
                code=err_code, http_status=status, request_id=request_id)
        return self._failure(mapped)


# --------------------------------------------------------------------------
# Mock inference — zero credits, zero network
# --------------------------------------------------------------------------

class MockInferenceClient:
    """Scripted stand-in for ZeroGClient. Performs NO network I/O.

    Drives the agentic loop through a fixed, plausible tool sequence and then
    concludes with INSUFFICIENT_EVIDENCE, explicitly labelled as mock output so
    nothing it says can be mistaken for a real model judgement. The deterministic
    risk score and evidence are computed independently of it, as always.
    """

    name = "0g-mock"
    model = "mock"

    _SEQUENCE = ("compute_features", "detect_pattern", "trace_account_network")
    _TX_RE = re.compile(r'"transaction_id":\s*"([^"]+)"')
    _GATHERED_RE = re.compile(r'"evidence_gathered":\s*\[(.*?)\]', re.DOTALL)

    def __init__(self) -> None:
        self._calls = 0

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        self._calls += 1
        tx = self._TX_RE.search(prompt)
        tx_id = tx.group(1) if tx else ""
        gathered = self._GATHERED_RE.search(prompt)
        done = set(re.findall(r'"([^"]+)"', gathered.group(1))) if gathered else set()

        for tool in self._SEQUENCE:
            if tool not in done:
                return json.dumps({
                    "reasoning": f"[MOCK INFERENCE] Next, run {tool} (scripted step).",
                    "action": tool,
                    "args": {"transaction_id": tx_id},
                })
        return json.dumps({
            "reasoning": "[MOCK INFERENCE] Scripted evidence gathering is complete.",
            "action": "conclude",
            "recommendation": "INSUFFICIENT_EVIDENCE",
            "justification": ("[MOCK INFERENCE] No model was called, so no real "
                              "judgement was made. Refer to the deterministic "
                              "risk score and evidence."),
        })

    def usage_summary(self) -> dict[str, Any]:
        return {"calls": self._calls, "prompt_tokens": 0, "completion_tokens": 0,
                "total_tokens": 0, "cost_usd": 0.0, "cost_is_estimate": False,
                "mock": True}


# --------------------------------------------------------------------------
# vLLM / Gemma client (OpenAI-compatible chat endpoint) — legacy
# --------------------------------------------------------------------------

class VLLMClient:
    """Minimal client for a vLLM server exposing the OpenAI chat API.

    Uses only the standard library (urllib) to avoid extra deps inside the TEE.
    """

    name = "vllm"

    def __init__(self, base_url: str | None = None, model: str | None = None,
                 timeout: float = 30.0) -> None:
        self.base_url = (base_url or os.environ.get("FRAB_VLLM_URL",
                         "http://localhost:8000/v1")).rstrip("/")
        self.model = model or os.environ.get("FRAB_GEMMA_MODEL", "google/gemma-2-9b-it")
        self.timeout = timeout

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        import urllib.error
        import urllib.request

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = json.dumps({
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LLMUnavailable(f"vLLM endpoint unreachable: {exc}") from exc
        try:
            return body["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected vLLM response shape: {body}") from exc


# --------------------------------------------------------------------------
# Attested Gemma client (Confidential Space / TEE — stretch path)
# --------------------------------------------------------------------------

class AttestedGemmaClient:
    """Talks to Gemma served by vLLM inside a Confidential Space, over an
    attested, encrypted channel using Google's Prompt Encryption SDK.

    The SDK verifies the enclave's hardware quote + software (image) hash BEFORE
    any prompt is sent — if attestation fails, the prompt is never transmitted.
    This is the client side of the codelab's confidential-inference architecture
    (server side is provisioned by the codelab's setup.sh).

    Config (set after setup.sh outputs them):
        FRAB_ATTESTED_URL         load balancer URL, e.g. https://<LB_IP>:8000
        FRAB_ATTESTED_IMAGE_HASH  expected container image hash (attestation policy)
        FRAB_GEMMA_MODEL          model name served in the enclave

    The prompt_encryption_sdk dependency is OPTIONAL — it is imported lazily so
    the worker (and its tests) run without it installed. get_client() falls back
    to offline mode if the SDK or config is missing.
    """

    name = "attested"

    def __init__(self, url: str | None = None, image_hash: str | None = None,
                 model: str | None = None, timeout: float = 60.0) -> None:
        self.url = url or os.environ.get("FRAB_ATTESTED_URL", "")
        self.image_hash = image_hash or os.environ.get("FRAB_ATTESTED_IMAGE_HASH", "")
        self.model = model or os.environ.get("FRAB_GEMMA_MODEL", "google/gemma-2-9b-it")
        self.timeout = timeout
        if not self.url or not self.image_hash:
            raise LLMUnavailable(
                "AttestedGemmaClient needs FRAB_ATTESTED_URL and "
                "FRAB_ATTESTED_IMAGE_HASH (from the codelab setup.sh output)."
            )
        try:
            # lazy import: the SDK is only needed on the attested path
            from prompt_encryption_sdk import ConfidentialSDKClient  # type: ignore
            from prompt_encryption_sdk import AttestationPolicy  # type: ignore
        except ImportError as exc:  # pragma: no cover - depends on optional dep
            raise LLMUnavailable(
                "prompt_encryption_sdk is not installed. Install it on the "
                "attested-path host (see DEPLOY.md Path B)."
            ) from exc
        # TODO(codelab): confirm exact policy/client constructor signature against
        # the installed SDK version. The shape below follows the codelab's
        # ConfidentialSDKClient usage (attested TLS + image-hash policy).
        self._policy = AttestationPolicy(image_hash=self.image_hash)
        self._client = ConfidentialSDKClient(base_url=self.url, policy=self._policy)

    def complete(self, prompt: str, *, system: str = "", temperature: float = 0.0,
                 max_tokens: int = 1024) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        # The SDK performs the attested handshake, then sends this like an
        # OpenAI-compatible chat request. Response shape mirrors vLLM's.
        resp = self._client.post(
            "/v1/chat/completions",
            json={
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
            timeout=self.timeout,
        )
        try:
            return resp.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise LLMError(f"Unexpected attested response shape: {exc}") from exc


# --------------------------------------------------------------------------
# Factory + JSON helper
# --------------------------------------------------------------------------

_ZG_ALIASES = {"0g", "zg", "0g-private", "0g_private"}


def provider_kind(kind: str | None = None) -> str:
    """Resolve the configured provider: argument > LLM_PROVIDER > FRAB_LLM
    (legacy name) > offline."""
    return (kind or os.environ.get("LLM_PROVIDER") or os.environ.get("FRAB_LLM")
            or "offline").strip().lower()


def mock_mode_enabled() -> bool:
    """LLM_MOCK_MODE defaults to TRUE so nothing spends credits by accident."""
    return _truthy(os.environ.get("LLM_MOCK_MODE", "true"))


def llm_mode_name() -> str:
    """The effective mode, for /health. Performs no I/O."""
    kind = provider_kind()
    if kind in _ZG_ALIASES:
        return "0g-mock" if mock_mode_enabled() else "0g"
    return kind


def get_client(kind: str | None = None) -> LLMClient:
    """Return an LLM client, selected by LLM_PROVIDER (legacy: FRAB_LLM).

        offline (default) -> OfflineLLMClient (deterministic, no model)
        0g                -> MockInferenceClient while LLM_MOCK_MODE is true
                             (the default), ZeroGClient (real, private-mode
                             inference) when LLM_MOCK_MODE=false
        vllm              -> VLLMClient (legacy GPU VM, OpenAI-compatible)
        attested          -> AttestedGemmaClient (Confidential Space/TEE)

    Constructing a client performs no network I/O. Selecting 0g in real mode with
    missing/invalid configuration raises LLMConfigError instead of quietly
    falling back: a silent fallback would hide that inference is not private.
    """
    kind = provider_kind(kind)
    if kind in _ZG_ALIASES:
        return MockInferenceClient() if mock_mode_enabled() else ZeroGClient()
    if kind == "vllm":
        return VLLMClient()
    if kind == "attested":
        try:
            return AttestedGemmaClient()
        except LLMUnavailable:
            # not configured / SDK absent -> safe deterministic fallback
            return OfflineLLMClient()
    return OfflineLLMClient()


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json(text: str) -> dict[str, Any]:
    """Pull the first JSON object out of a model response."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _JSON_RE.search(text)
    if not m:
        raise LLMError(f"No JSON object found in response: {text[:200]!r}")
    return json.loads(m.group(0))


def generate_json(
    client: LLMClient,
    prompt: str,
    *,
    system: str = "",
    validate: Callable[[dict[str, Any]], None] | None = None,
    max_retries: int = 2,
    temperature: float = 0.0,
) -> dict[str, Any]:
    """Generate a JSON object, validating and repairing on failure.

    On a parse/validation error the client is re-prompted with the error, up to
    max_retries. Raises LLMError if it still fails — the caller (an agent) turns
    that into a graceful partial/insufficient-evidence outcome rather than a
    crash. Provider errors (LLMProviderError) are never re-prompted.

    NOTE: nothing in the live investigation path calls this helper today; pass
    max_retries=0 if you ever use it with a metered provider.
    """
    last_err: Exception | None = None
    attempt_prompt = prompt
    for _ in range(max_retries + 1):
        raw = client.complete(attempt_prompt, system=system, temperature=temperature)
        try:
            obj = extract_json(raw)
            if validate:
                validate(obj)
            return obj
        except LLMProviderError:
            raise
        except (LLMError, ValueError) as exc:
            last_err = exc
            attempt_prompt = (
                prompt
                + f"\n\nYour previous response was invalid ({exc}). "
                + "Respond with ONLY a valid JSON object matching the schema."
            )
    raise LLMError(f"Failed to produce valid JSON after retries: {last_err}")
