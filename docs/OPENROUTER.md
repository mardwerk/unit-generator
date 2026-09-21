# Allowed OpenRouter models

Free model IDs checked against OpenRouter's catalogue on September 22, 2026. Verify that the selected free model still has zero input and output token prices before calling.

| Type | Allowed model |
| --- | --- |
| Free text generation | `nvidia/nemotron-3-ultra-550b-a55b:free` |
| Free text generation | `poolside/laguna-s-2.1:free` |
| Free text generation | `inclusionai/ling-3.0-flash-fin:free` |
| Free text generation | `dots-studio/dots-3-note-preview:free` |
| Free text generation | `nvidia/nemotron-3.5-lightning:free` |
| Free text generation | `inclusionai/ling-3.0-flash-vl:free` |
| Free text generation | `nex-agi/nex-n2.5-pro:free` |
| Free text generation | `thinkingmachines/inkling:free` |
| Free text generation | `nvidia/nemotron-3-super-120b-a12b:free` |
| Free text generation | `inclusionai/ling-3.0-flash-sante:free` |
| Free text generation | `thinkingmachines/inkling-small:free` |
| Free text generation | `cohere/north-mini-code:free` |
| Free text generation | `nex-agi/nex-n2.5-mini:free` |
| Free text generation | `poolside/laguna-xs-2.1:free` |
| Free text generation | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` |
| Free text generation | `liquid/lfm-2.5-2.6b:free` |
| Free text generation | `qwen/qwen3.8-27b:free` |
| Free text generation | `z-ai/glm-5.2:free` |
| Free text generation | `nvidia/nemotron-3.5-content-safety:free` |
| Free text generation | `google/gemma-4-26b-a4b-it:free` |
| Free text generation | `google/gemma-4-31b-it:free` |
| Paid text generation | `xiaomi/mimo-v2.6-flash` |
| Paid text generation | `deepseek/deepseek-v4.1-flash` |
| Paid text generation | `meta/muse-spark-1.3-contributor` |
| Paid text generation | `z-ai/glm-5.3-flash` |
| Paid text generation | `openai/gpt-5.6-luna` |
| Image generation | `meta/muse-image` |
| Image generation | `bytedance-seed/seedream-5-0-lite` |
| Image generation | `x-ai/grok-imagine-image-2.0` |
| Image generation | `qwen/qwen-image-3-pro` |

Every other OpenRouter model is disallowed. GPT-5.4 Mini and its aliases remain explicitly prohibited. Do not use an unapproved fallback or an opaque model router. Before using a model outside this table, ask the user and update this file according to their answer before dispatch.

Existing spending limits and image-generation authorization still apply. Native Codex CLI and subagent models are outside this OpenRouter policy.
