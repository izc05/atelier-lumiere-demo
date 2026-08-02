from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRAND_HEAD = (
    '<link rel="icon" type="image/svg+xml" '
    'href="/atelier-lumiere-demo/assets/brand/favicon.svg"/>'
    '<meta name="theme-color" content="#5A0F1F"/>'
    '<link rel="stylesheet" '
    'href="/atelier-lumiere-demo/assets/brand/brand.css?v=1"/>'
)
BRAND_SCRIPT = (
    '<script src="/atelier-lumiere-demo/assets/brand/brand.js?v=1" defer></script>'
)
TEXT_EXTENSIONS = {'.html', '.js', '.txt', '.json', '.xml', '.webmanifest'}
EXCLUDED_PARTS = {'.git', 'node_modules', 'assets', 'scripts', '.github'}

REPLACEMENTS = (
    ('Alma de Fiesta', 'Atelier Lumière'),
    ('Entrar al atelier', 'Entrar al taller'),
    ('Piezas hechas a mano para bodas, comuniones, bautizos y celebraciones.',
     'Piezas artesanales para bodas, comuniones y celebraciones. '
     'Detalles hechos despacio para momentos que merecen ser recordados.'),
)


def should_process(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if any(part in EXCLUDED_PARTS for part in relative.parts):
        return False
    return path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS


def transform(path: Path) -> bool:
    try:
        original = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return False

    updated = original
    for old, new in REPLACEMENTS:
        updated = updated.replace(old, new)

    if path.suffix.lower() == '.html':
        if '/assets/brand/brand.css' not in updated and '</head>' in updated:
            updated = updated.replace('</head>', f'{BRAND_HEAD}</head>', 1)
        if '/assets/brand/brand.js' not in updated and '</body>' in updated:
            head, tail = updated.rsplit('</body>', 1)
            updated = f'{head}{BRAND_SCRIPT}</body>{tail}'

    if updated == original:
        return False

    path.write_text(updated, encoding='utf-8')
    return True


def main() -> None:
    changed: list[str] = []
    for path in sorted(ROOT.rglob('*')):
        if should_process(path) and transform(path):
            changed.append(str(path.relative_to(ROOT)))

    print(f'Identidad Atelier Lumière aplicada a {len(changed)} archivos.')
    for item in changed:
        print(f' - {item}')


if __name__ == '__main__':
    main()
