from __future__ import annotations

from pathlib import Path

from .contracts import ModelReply, ModelSpec
from .local_hf import LocalHFClient
from .moondream import MoondreamClient
from .openrouter import OpenRouterClient


class ProviderClient:
    def __init__(self, timeout_seconds: int = 90) -> None:
        self.timeout_seconds = timeout_seconds
        self._openrouter: OpenRouterClient | None = None
        self._moondream: MoondreamClient | None = None
        self._local_hf: LocalHFClient | None = None

    def predict_point(
        self,
        model: ModelSpec,
        image_path: Path,
        instruction: str,
        purpose: str,
    ) -> ModelReply:
        provider = model.provider.lower()
        if provider == "openrouter":
            return self._openrouter_client().predict_point(
                model.model_id, image_path, instruction, purpose
            )
        if provider == "moondream":
            return self._moondream_client().predict_point(
                model.model_id, image_path, instruction, purpose
            )
        if provider == "local_hf":
            return self._local_hf_client().predict_point(
                model, image_path, instruction, purpose
            )

        raise RuntimeError(f"Unsupported model provider: {model.provider}")

    def _openrouter_client(self) -> OpenRouterClient:
        if self._openrouter is None:
            self._openrouter = OpenRouterClient(timeout_seconds=self.timeout_seconds)
        return self._openrouter

    def _moondream_client(self) -> MoondreamClient:
        if self._moondream is None:
            self._moondream = MoondreamClient(timeout_seconds=self.timeout_seconds)
        return self._moondream

    def _local_hf_client(self) -> LocalHFClient:
        if self._local_hf is None:
            self._local_hf = LocalHFClient()
        return self._local_hf
