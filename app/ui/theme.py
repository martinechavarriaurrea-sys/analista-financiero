"""UI style constants."""

from __future__ import annotations

import customtkinter as ctk

from app.config import BLUE_THEME

FONT_TITLE = ("Montserrat", 22, "bold")
FONT_SUBTITLE = ("Montserrat", 16, "bold")
FONT_BODY = ("Work Sans", 12)
FONT_MONO = ("Consolas", 11)


def apply_theme() -> None:
    ctk.set_appearance_mode("light")
    ctk.set_default_color_theme("blue")


def palette() -> dict:
    return BLUE_THEME
