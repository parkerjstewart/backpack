"""Utilities to make assistant text speakable in plain English."""

from __future__ import annotations

import re

LATEX_BLOCK_RE = re.compile(r"\$\$(.*?)\$\$", re.DOTALL)
LATEX_INLINE_RE = re.compile(r"\$(.+?)\$")


def _normalize_spacing(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _latex_to_speech(latex: str) -> str:
    """Convert common math notation to speech-friendly text.

    This is intentionally conservative: for unfamiliar syntax we preserve text
    but still make common symbols and constructs readable.
    """
    value = latex.strip()
    if not value:
        return ""

    # Fractions and roots first so nested content is still readable.
    value = re.sub(
        r"\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}",
        r"\1 over \2",
        value,
    )
    value = re.sub(
        r"\\sqrt\s*\{([^{}]+)\}",
        r"square root of \1",
        value,
    )
    value = re.sub(
        r"([A-Za-z0-9\)\}])\s*\^\s*\{([^{}]+)\}",
        r"\1 to the power of \2",
        value,
    )
    value = re.sub(
        r"([A-Za-z0-9\)\}])\s*\^\s*([A-Za-z0-9]+)",
        r"\1 to the power of \2",
        value,
    )

    # Common latex commands/symbols.
    replacements = {
        r"\cdot": " times ",
        r"\times": " times ",
        r"\div": " divided by ",
        r"\pm": " plus or minus ",
        r"\neq": " not equal to ",
        r"\leq": " less than or equal to ",
        r"\geq": " greater than or equal to ",
        r"\approx": " approximately ",
        r"\infty": " infinity ",
        r"\sum": " summation ",
        r"\int": " integral ",
        r"\theta": " theta ",
        r"\alpha": " alpha ",
        r"\beta": " beta ",
        r"\gamma": " gamma ",
        r"\pi": " pi ",
    }
    for key, replacement in replacements.items():
        value = value.replace(key, replacement)

    # Strip formatting commands while keeping contents.
    value = re.sub(r"\\(left|right)\b", " ", value)
    value = re.sub(r"\\mathrm\s*\{([^{}]+)\}", r"\1", value)
    value = re.sub(r"\\text\s*\{([^{}]+)\}", r"\1", value)
    value = re.sub(r"\\[a-zA-Z]+\s*", " ", value)

    # Remove braces and map symbols.
    value = value.replace("{", " ").replace("}", " ")
    symbol_map = {
        "=": " equals ",
        "+": " plus ",
        "-": " minus ",
        "*": " times ",
        "/": " over ",
        "<": " less than ",
        ">": " greater than ",
    }
    for symbol, replacement in symbol_map.items():
        value = value.replace(symbol, replacement)

    return _normalize_spacing(value)


def format_for_voice(display_text: str) -> tuple[str, str]:
    """Return (display_text, speech_text) for assistant output.

    - display_text keeps original markdown/latex for UI rendering.
    - speech_text converts latex/math into plain English.
    """
    if not display_text:
        return "", ""

    speech = display_text

    def block_replacer(match: re.Match[str]) -> str:
        return f" {_latex_to_speech(match.group(1))} "

    def inline_replacer(match: re.Match[str]) -> str:
        return f" {_latex_to_speech(match.group(1))} "

    speech = LATEX_BLOCK_RE.sub(block_replacer, speech)
    speech = LATEX_INLINE_RE.sub(inline_replacer, speech)
    speech = _normalize_spacing(speech)

    return display_text, speech

