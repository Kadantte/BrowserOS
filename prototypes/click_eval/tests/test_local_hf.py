from types import SimpleNamespace

from click_eval.local_hf import (
    _patch_qwen25_mrope_section,
    _qwen25_manual_prompt_text,
)


def test_qwen25_manual_prompt_text_includes_image_placeholder():
    text = _qwen25_manual_prompt_text(
        [
            {"role": "system", "content": "system prompt"},
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": object()},
                    {"type": "text", "text": "click the button"},
                ],
            },
        ]
    )

    assert "<|vision_start|><|image_pad|><|vision_end|>" in text
    assert text.endswith("<|im_start|>assistant\n")
    assert "click the button" in text


def test_patch_qwen25_mrope_section_adds_missing_default():
    text_config = SimpleNamespace(rope_scaling={"type": "default"})
    hf_model = SimpleNamespace(
        config=SimpleNamespace(text_config=text_config),
        model=None,
        language_model=None,
    )

    _patch_qwen25_mrope_section(hf_model)

    assert text_config.rope_scaling["mrope_section"] == [16, 24, 24]


def test_patch_qwen25_mrope_section_preserves_existing_value():
    text_config = SimpleNamespace(
        rope_scaling={"type": "default", "mrope_section": [1, 2, 3]}
    )
    hf_model = SimpleNamespace(
        config=SimpleNamespace(text_config=text_config),
        model=None,
        language_model=None,
    )

    _patch_qwen25_mrope_section(hf_model)

    assert text_config.rope_scaling["mrope_section"] == [1, 2, 3]
