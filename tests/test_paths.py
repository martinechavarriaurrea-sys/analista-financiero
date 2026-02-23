from pathlib import Path

from app.core.paths import get_app_workspace, get_desktop_path, get_reports_path, get_temp_charts_path


def test_desktop_path_exists_or_creates():
    path = get_desktop_path(create_if_missing=True)
    assert isinstance(path, Path)
    assert path.exists()


def test_workspace_and_report_paths_created():
    workspace = get_app_workspace(create_if_missing=True)
    reports = get_reports_path(create_if_missing=True)
    charts = get_temp_charts_path(create_if_missing=True)

    assert workspace.exists()
    assert reports.exists()
    assert charts.exists()
