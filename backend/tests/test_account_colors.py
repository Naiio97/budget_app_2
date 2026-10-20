"""Validace barvy účtu (PUT /settings/account-colors) — jen #rrggbb."""
from routers.settings import _HEX_COLOR_RE


def test_accepts_hex_colors():
    assert _HEX_COLOR_RE.match("#3b7dd8")
    assert _HEX_COLOR_RE.match("#ABCDEF")


def test_rejects_other_formats():
    for bad in ["3b7dd8", "#fff", "#3b7dd", "#3b7dd8aa", "red", "#gggggg", "", "url(x)"]:
        assert not _HEX_COLOR_RE.match(bad), bad
