from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .contracts import ModelReply, ModelSkipped, ModelSpec
from .image_utils import require_pillow
from .openrouter import _point_prompt


@dataclass(frozen=True)
class GpuInfo:
    present: bool
    name: str | None = None
    total_vram_gb: float | None = None
    reason: str | None = None


class LocalHFClient:
    def __init__(
        self,
        timeout_seconds: int = 90,
        max_new_tokens: int = 64,
        log_callback: Callable[[str], None] | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_new_tokens = max_new_tokens
        self._log_callback = log_callback
        self._gpu_info: GpuInfo | None = None
        self._loaded: dict[str, tuple[Any, Any, Any]] = {}

    def predict_point(
        self,
        model: ModelSpec,
        image_path: Path,
        instruction: str,
        purpose: str,
    ) -> ModelReply:
        gpu_info = self.gpu_info()
        if not gpu_info.present:
            reason = f": {gpu_info.reason}" if gpu_info.reason else ""
            raise ModelSkipped(f"skipped - no usable CUDA GPU present{reason}")

        if (
            model.estimated_vram_gb is not None
            and gpu_info.total_vram_gb is not None
            and model.estimated_vram_gb > gpu_info.total_vram_gb
        ):
            raise ModelSkipped(
                "skipped - GPU VRAM "
                f"{gpu_info.total_vram_gb:.1f}GB < estimated "
                f"{model.estimated_vram_gb:.1f}GB"
            )

        torch, processor, hf_model = self._load_model(model)
        Image, _, _ = require_pillow()
        self._log(f"{model.name}: loading image and building prompt")
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        width, height = image.size
        prompt = _point_prompt(instruction, width, height, purpose)
        inputs = _build_inputs(processor, image, prompt)
        input_device = _first_model_device(hf_model)
        inputs = {
            key: value.to(input_device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
        self._log(
            f"{model.name}: generating with max_new_tokens={self.max_new_tokens}, "
            f"max_time={self.timeout_seconds}s"
        )
        with torch.inference_mode():
            generated = hf_model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                max_time=self.timeout_seconds,
                do_sample=False,
            )
        text = _decode_output(processor, inputs, generated)
        return ModelReply(
            text=text,
            raw={
                "model": model.model_id,
                "gpu": gpu_info.__dict__,
                "device_map": getattr(hf_model, "hf_device_map", None),
            },
        )

    def gpu_info(self) -> GpuInfo:
        if self._gpu_info is None:
            self._gpu_info = detect_gpu()
        return self._gpu_info

    def _load_model(self, model: ModelSpec):
        model_id = model.model_id
        if model_id in self._loaded:
            return self._loaded[model_id]

        try:
            import torch
            from transformers import AutoProcessor
            import transformers
        except ImportError as exc:
            raise ModelSkipped(
                "skipped - local HF dependencies missing; install with "
                "`uv sync --extra local`"
            ) from exc

        self._log(f"{model.name}: loading processor")
        processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        model_cls = _model_class(transformers)
        self._log(f"{model.name}: loading weights onto cuda:0")
        try:
            hf_model = model_cls.from_pretrained(
                model_id,
                device_map={"": "cuda:0"},
                torch_dtype=_preferred_cuda_dtype(torch),
                trust_remote_code=True,
            )
        except Exception as exc:
            if _looks_like_cuda_fit_failure(exc):
                raise ModelSkipped(
                    "skipped - model did not fit on the CUDA GPU without CPU offload"
                ) from exc
            raise
        hf_model.eval()
        self._loaded[model_id] = (torch, processor, hf_model)
        return self._loaded[model_id]

    def _log(self, message: str) -> None:
        if self._log_callback is not None:
            self._log_callback(f"[local_hf] {message}")


def detect_gpu() -> GpuInfo:
    nvidia = _detect_nvidia_smi()
    try:
        import torch
    except ImportError:
        return GpuInfo(present=False, reason="torch is not installed")

    if not torch.cuda.is_available():
        if nvidia.present:
            return GpuInfo(
                present=False,
                name=nvidia.name,
                total_vram_gb=nvidia.total_vram_gb,
                reason=(
                    "NVIDIA GPU was detected by nvidia-smi, but CUDA is "
                    "unavailable to PyTorch"
                ),
            )
        return GpuInfo(present=False, reason="no CUDA GPU detected")

    props = torch.cuda.get_device_properties(0)
    return GpuInfo(
        present=True,
        name=props.name or nvidia.name,
        total_vram_gb=(
            nvidia.total_vram_gb
            if nvidia.total_vram_gb is not None
            else props.total_memory / 1024**3
        )
    )


def _detect_nvidia_smi() -> GpuInfo:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return GpuInfo(present=False, reason="nvidia-smi unavailable")

    line = next((item.strip() for item in result.stdout.splitlines() if item.strip()), "")
    if not line:
        return GpuInfo(present=False, reason="nvidia-smi returned no GPUs")

    name, _, memory_mb_text = line.rpartition(",")
    try:
        total_vram_gb = float(memory_mb_text.strip()) / 1024
    except ValueError:
        total_vram_gb = None
    return GpuInfo(
        present=True,
        name=name.strip() or None,
        total_vram_gb=total_vram_gb,
    )


def _model_class(transformers):
    for name in (
        "AutoModelForImageTextToText",
        "AutoModelForVision2Seq",
        "AutoModelForCausalLM",
    ):
        model_cls = getattr(transformers, name, None)
        if model_cls is not None:
            return model_cls
    raise RuntimeError("Installed transformers does not provide a VLM model class")


def _build_inputs(processor, image, prompt: str):
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    apply_chat_template = getattr(processor, "apply_chat_template", None)
    if apply_chat_template is not None:
        try:
            return apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            )
        except TypeError:
            pass

    return processor(images=image, text=prompt, return_tensors="pt")


def _first_model_device(hf_model):
    device = getattr(hf_model, "device", None)
    if device is not None:
        return device
    return next(hf_model.parameters()).device


def _preferred_cuda_dtype(torch):
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def _looks_like_cuda_fit_failure(exc: Exception) -> bool:
    message = str(exc).lower()
    return any(
        marker in message
        for marker in (
            "out of memory",
            "cuda error",
            "not enough memory",
            "cannot access accelerator device",
            "torch not compiled with cuda",
        )
    )


def _decode_output(processor, inputs, generated) -> str:
    input_ids = inputs.get("input_ids")
    if input_ids is not None and hasattr(generated, "shape"):
        generated = generated[:, input_ids.shape[-1] :]
    if hasattr(processor, "batch_decode"):
        decoded = processor.batch_decode(generated, skip_special_tokens=True)
        return decoded[0] if decoded else ""
    if hasattr(processor, "decode"):
        return processor.decode(generated[0], skip_special_tokens=True)
    return json.dumps({"error": "processor cannot decode generated output"})
