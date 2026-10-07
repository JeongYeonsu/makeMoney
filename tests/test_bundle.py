"""배포용 한 파일 묶음이 외부 JS/CSS 파일 없이 동작하는 형태인지 확인."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from bundle_web import bundle  # noqa: E402


def test_bundle_is_self_contained(tmp_path):
    html = bundle(tmp_path / "dist").read_text(encoding="utf-8")
    assert 'src="app.js"' not in html
    assert 'href="app.css"' not in html
    assert "import * as E" not in html
    assert "export " not in html.split("<script type=\"module\">")[1]
    assert "const E = {" in html and "countTrades" in html
