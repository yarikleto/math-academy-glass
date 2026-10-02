"""Build the allowlisted Chrome package without machine-specific ZIP metadata."""

import hashlib
import json
from pathlib import Path
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
FILES = ["manifest.json", "README.md", "PRIVACY.md", "ARCHITECTURE.md", "LICENSE"]
DIRECTORIES = ["background", "content", "styles", "popup", "icons"]
ARCHIVE = ROOT / "math-academy-glass-extension.zip"


def main():
    paths = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        for path in (ROOT / directory).rglob("*"):
            if path.is_symlink():
                raise ValueError(f"Symlinks are not allowed in the package: {path}")
            if path.is_file() and path.name != ".DS_Store":
                paths.append(path)
    with tempfile.NamedTemporaryFile(dir=ROOT, suffix=".zip", delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=9) as archive:
            for path in sorted(paths):
                if path.is_symlink():
                    raise ValueError(f"Symlinks are not allowed in the package: {path}")
                info = zipfile.ZipInfo(path.relative_to(ROOT).as_posix(), (2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes(), compresslevel=9)
        temporary.replace(ARCHIVE)
    finally:
        temporary.unlink(missing_ok=True)
    metadata = {
        "version": json.loads((ROOT / "manifest.json").read_text())["version"],
        "file": ARCHIVE.name,
        "bytes": ARCHIVE.stat().st_size,
        "sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
    }
    (ROOT / "release-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
