#!/usr/bin/env python3
"""Bundle src/ (plus vendor/three.min.js) into one self-contained page.

Writes:
  dist/block_war_3d.html   - double-click to play locally (no internet needed)
  docs/index.html          - the same page, served by GitHub Pages
"""
import base64
import os
import re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "src")

html = open(os.path.join(src, "index.html"), encoding="utf-8").read()


def inline(match):
    path = os.path.normpath(os.path.join(src, match.group(1)))
    code = open(path, encoding="utf-8").read().replace("</script>", "<\\/script>")
    return "<script>\n" + code + "\n</script>"


html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
icon = base64.b64encode(open(os.path.join(root, "assets", "favicon.png"), "rb").read()).decode()
html = html.replace("<!--FAVICON-->", f'<link rel="icon" type="image/png" href="data:image/png;base64,{icon}">')

for out in (os.path.join(root, "dist", "block_war_3d.html"), os.path.join(root, "docs", "index.html")):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write(html)
    print(out, round(os.path.getsize(out) / 1e6, 2), "MB")
