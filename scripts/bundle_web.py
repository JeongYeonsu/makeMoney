"""web/ 의 화면 코드(HTML·CSS·JS)를 index.html 한 파일로 묶습니다.

StatiCrypt 는 HTML 파일만 암호화하므로, CSS·JS 를 HTML 안에 넣어야 비밀번호 없이
코드를 볼 수 없게 됩니다. 데이터(web/data)는 공개 시세라 그대로 복사합니다.

    python scripts/bundle_web.py --out dist
    npx staticrypt dist/index.html -d dist ...   (배포 워크플로가 실행)
"""
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def bundle(out: Path) -> Path:
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "app.css").read_text(encoding="utf-8")
    engine = (WEB / "engine.js").read_text(encoding="utf-8")
    app = (WEB / "app.js").read_text(encoding="utf-8")

    # engine.js 의 export 를 지우고, app.js 의 import 를 같은 이름의 객체로 바꿈
    names = re.findall(r"^export (?:const|function) (\w+)", engine, flags=re.M)
    engine = re.sub(r"^export ", "", engine, flags=re.M)
    imp = "import * as E from './engine.js';"
    if imp not in app:
        raise SystemExit("app.js 의 engine import 형식이 바뀌었습니다 — bundle_web.py 를 확인하세요")
    app = app.replace(imp, f"const E = {{ {', '.join(names)} }};")
    script = f"{engine}\n{app}"
    if "</script" in script.lower():
        raise SystemExit("JS 안에 </script 문자열이 있어 인라인할 수 없습니다")

    css_tag = '<link rel="stylesheet" href="app.css">'
    js_tag = '<script type="module" src="app.js"></script>'
    for tag in (css_tag, js_tag):
        if tag not in html:
            raise SystemExit(f"index.html 에서 {tag} 를 찾지 못했습니다")
    html = html.replace(css_tag, f"<style>\n{css}\n</style>")
    html = html.replace(js_tag, f'<script type="module">\n{script}\n</script>')

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    (out / "index.html").write_text(html, encoding="utf-8")
    if (WEB / "data").exists():
        shutil.copytree(WEB / "data", out / "data")
    print(f"[ok] {out / 'index.html'} ({len(html) / 1024:.0f}KB), data 복사: {(out / 'data').exists()}")
    return out / "index.html"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dist")
    bundle(Path(ap.parse_args().out))
