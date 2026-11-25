from pathlib import Path
from app import __version__

def test_changelog_documents_current_version():
    text = (Path(__file__).resolve().parents[2] / "CHANGELOG.md").read_text()
    assert f"## [{__version__}]" in text, "bump __version__ and add a CHANGELOG entry for every release"
