from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
    def __init__(self) -> None:
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
            raise ModelSkipped("skipped - no GPU present")

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

        torch, processor, hf_model = self._load_model(model.model_id)
        Image, _, _ = require_pillow()
        with Image.open(image_path) as opened:
            image = opened.convert("RGB")
        width, height = image.size
        prompt = _point_prompt(instruction, width, height, purpose)
        inputs = _build_inputs(processor, image, prompt)
        inputs = {
            key: value.to(hf_model.device) if hasattr(value, "to") else value
            for key, value in inputs.items()
        }
        with torch.inference_mode():
            generated = hf_model.generate(**inputs, max_new_tokens=256, do_sample=False)
        text = _decode_output(processor, inputs, generated)
        return ModelReply(text=text, raw={"model": model.model_id, "gpu": gpu_info.__dict__})

    def gpu_info(self) -> GpuInfo:
        if self._gpu_info is None:
            self._gpu_info = detect_gpu()
        return self._gpu_info

    def _load_model(self, model_id: str):
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

        processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
        model_cls = _model_class(transformers)
        hf_model = model_cls.from_pretrained(
            model_id,
            device_map="auto",
            torch_dtype="auto",
            trust_remote_code=True,
        )
        self._loaded[model_id] = (torch, processor, hf_model)
        return self._loaded[model_id]


def detect_gpu() -> GpuInfo:
    nvidia = _detect_nvidia_smi()
    if nvidia.present:
        return nvidia

    try:
        import torch
    except ImportError:
        return GpuInfo(present=False, reason="torch is not installed")

    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        return GpuInfo(
            present=True,
            name=props.name,
            total_vram_gb=props.total_memory / 1024**3,
        )

    return GpuInfo(present=False, reason="no CUDA GPU detected")


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
