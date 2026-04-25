from __future__ import annotations

import base64
import mimetypes
from pathlib import Path


def require_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise RuntimeError(
            "Pillow is required for image dimensions and annotations. "
            "Install prototypes/click_eval/requirements.txt or run with "
            "`uv run --with pillow ...`."
        ) from exc

    return Image, ImageDraw, ImageFont


def image_size(path: Path) -> tuple[int, int]:
    Image, _, _ = require_pillow()
    with Image.open(path) as image:
        return image.size


def image_data_url(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"
