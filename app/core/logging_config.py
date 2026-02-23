"""Logging setup."""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.paths import get_app_workspace


def configure_logging() -> None:
    workspace = get_app_workspace(create_if_missing=True)
    log_file = Path(workspace) / "app.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
