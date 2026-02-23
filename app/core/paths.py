"""Filesystem path helpers (Desktop-aware)."""

from __future__ import annotations

import os
import platform
from pathlib import Path

from app.config import APP_FOLDER_NAME


def _existing_path(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_dir():
            return candidate
    return None


def get_desktop_path(create_if_missing: bool = True) -> Path:
    """Return Desktop path on Windows/macOS/Linux.

    If no Desktop exists, it creates one under the user's home directory.
    """
    system = platform.system().lower()
    home = Path.home()

    candidates: list[Path] = []

    if system == "windows":
        onedrive = os.environ.get("OneDrive")
        if onedrive:
            candidates.append(Path(onedrive) / "Desktop")

        onedrive_consumer = os.environ.get("OneDriveConsumer")
        if onedrive_consumer:
            candidates.append(Path(onedrive_consumer) / "Desktop")

        user_profile = os.environ.get("USERPROFILE")
        if user_profile:
            candidates.append(Path(user_profile) / "Desktop")

    candidates.append(home / "Desktop")

    desktop = _existing_path(candidates)
    if desktop:
        return desktop

    fallback = candidates[-1]
    if create_if_missing:
        fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def get_app_workspace(create_if_missing: bool = True) -> Path:
    """Workspace used by the app for exports and temp chart files."""
    folder = get_desktop_path(create_if_missing=create_if_missing) / APP_FOLDER_NAME
    if create_if_missing:
        folder.mkdir(parents=True, exist_ok=True)
    return folder


def get_reports_path(create_if_missing: bool = True) -> Path:
    reports = get_app_workspace(create_if_missing=create_if_missing) / "reportes"
    if create_if_missing:
        reports.mkdir(parents=True, exist_ok=True)
    return reports


def get_temp_charts_path(create_if_missing: bool = True) -> Path:
    temp_charts = get_app_workspace(create_if_missing=create_if_missing) / "charts_tmp"
    if create_if_missing:
        temp_charts.mkdir(parents=True, exist_ok=True)
    return temp_charts
