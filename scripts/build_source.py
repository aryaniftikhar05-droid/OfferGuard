"""Package authored source and derived model, never raw data or Site identity."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
out = root / 'dist/assets/offerguard-source.zip'
with ZipFile(out, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(root.rglob('*')):
        rel = path.relative_to(root)
        if not path.is_file() or path == out:
            continue
        if any(part in {'.git', '.openai', '.codex', 'node_modules', '__pycache__', '.venv', 'artifacts'} for part in rel.parts):
            continue
        if path.name == '.env' or path.name.startswith('.env.'):
            continue
        if rel.parts[:2] == ('data', 'raw') or path.suffix in {'.pyc', '.gz', '.zip'}:
            continue
        archive.write(path, 'offerguard/' + str(rel))
print(f'Source package: {out.stat().st_size:,} bytes. Raw data and Site identity excluded.')
