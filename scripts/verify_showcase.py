"""Check the public showcase bundle without installing dependencies."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
showcase = root / 'showcase'
assert (showcase / 'index.html').is_file(), 'showcase/index.html is missing'
assert (showcase / 'ra-original.png').is_file(), 'brand asset is missing'
assets = ['.html', '.css', '.js', '.mjs', '.png', '.svg', '.json']
for p in showcase.rglob('*'):
    if p.is_file():
        assert p.suffix in assets, f'unexpected public asset: {p.relative_to(root)}'
        if p.suffix in {'.html', '.css', '.js', '.mjs', '.json'}:
            text = p.read_text(encoding='utf-8')
            for match in re.finditer(r"(?:src|href)=\"([^\"]+)\"", text):
                target = match.group(1).split('?', 1)[0]
                if not target or target.startswith(('https:', 'http:', '#', 'mailto:', 'data:')):
                    continue
                assert (p.parent / target).exists(), f'broken local asset in {p}: {target}'
print('Showcase assets verified')
