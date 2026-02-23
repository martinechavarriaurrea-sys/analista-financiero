"""Entry point for desktop app."""

from __future__ import annotations

import logging

from app.core.logging_config import configure_logging
from app.ui.app_window import AnalyzerApp


def main() -> None:
    configure_logging()
    logging.getLogger(__name__).info("Starting desktop app")
    app = AnalyzerApp()
    app.mainloop()


if __name__ == "__main__":
    main()
