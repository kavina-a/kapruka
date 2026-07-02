"""Redirect to pipecat-server — run `python bot.py` from pipecat-server/ instead."""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent / "pipecat-server"
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

if __name__ == "__main__":
    import runpy

    runpy.run_path(str(_ROOT / "bot.py"), run_name="__main__")
