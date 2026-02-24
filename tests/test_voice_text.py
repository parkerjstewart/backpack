from backpack.utils.voice_text import format_for_voice


def test_format_for_voice_keeps_display_text():
    display, speech = format_for_voice("Solve: $x^2 + 1 = 0$")
    assert display == "Solve: $x^2 + 1 = 0$"
    assert "to the power of 2" in speech


def test_format_for_voice_handles_fraction():
    _, speech = format_for_voice("Use $$\\frac{a}{b} = c$$")
    assert "a over b" in speech
    assert "equals c" in speech


def test_format_for_voice_plain_text_passthrough():
    display, speech = format_for_voice("Hello world")
    assert display == "Hello world"
    assert speech == "Hello world"
