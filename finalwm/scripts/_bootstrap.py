from __future__ import annotations

import importlib
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _windows_store_python_hint(executable: str) -> str:
    lower = executable.lower()
    if "windowsapps\\python.exe" in lower:
        return (
            "\nDetected the Windows Store python shim instead of a real interpreter. "
            "Create and activate a fresh virtual environment from an installed Python release."
        )
    return ""


def require_packages(*package_names: str) -> None:
    missing = []
    for package_name in package_names:
        try:
            importlib.import_module(package_name)
        except ModuleNotFoundError:
            missing.append(package_name)

    if not missing:
        return

    missing_str = ", ".join(missing)
    executable = sys.executable or "python"
    hint = _windows_store_python_hint(executable)
    raise SystemExit(
        "Missing required Python packages: "
        f"{missing_str}\n\n"
        f"Current interpreter: {executable}\n"
        "Install the project dependencies in a fresh virtual environment:\n"
        "  python -m venv .venv\n"
        "  .\\.venv\\Scripts\\Activate.ps1\n"
        "  python -m pip install --upgrade pip\n"
        "  pip install -r requirements.txt\n"
        f"{hint}"
    )
