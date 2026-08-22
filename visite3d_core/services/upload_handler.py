"""Bloc 1.5 photo dropzone backend: accept individual images or a ZIP of
images, and always hand the caller back a flat list of image paths on disk.

extract_zip_to_temp() is careful about zip-slip (a crafted entry name like
"../../evil.exe" escaping the destination directory): every extracted path
is resolved and checked to still be inside dest_dir before being written.
"""

from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

from ..exceptions import VLMParserError
from ..utils.validators import is_supported_image


def extract_zip_to_temp(zip_path: Path | str, dest_dir: Path) -> list[Path]:
    """Extract every supported image found in a ZIP into dest_dir (flattened —
    original folder structure inside the archive is discarded) and return the
    list of extracted image paths. Non-image entries are skipped. Raises
    VLMParserError if the archive is not a valid ZIP or contains no images."""
    zip_path = Path(zip_path)
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_root = dest_dir.resolve()

    if not zipfile.is_zipfile(zip_path):
        raise VLMParserError(f"Not a valid ZIP file: {zip_path}")

    extracted: list[Path] = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            entry_name = Path(info.filename).name  # flatten: drop any directory component
            if not entry_name or not is_supported_image(entry_name):
                continue

            out_path = (dest_root / f"{uuid.uuid4().hex}_{entry_name}").resolve()
            if dest_root not in out_path.parents:
                continue  # zip-slip guard: extracted path escaped dest_dir

            with zf.open(info) as src, open(out_path, "wb") as dst:
                dst.write(src.read())
            extracted.append(out_path)

    if not extracted:
        raise VLMParserError(f"ZIP contains no supported images: {zip_path}")
    return extracted


def handle_photo_upload(file_path: Path | str, dest_dir: Path | str) -> list[Path]:
    """Normalize one uploaded file into a list of usable image paths.

    A ZIP is extracted (every image inside it returned); anything else is
    returned as a single-item list unchanged. dest_dir is only used as the
    ZIP extraction target — a plain image path is returned as-is.
    """
    file_path = Path(file_path)
    if file_path.suffix.lower() == ".zip":
        return extract_zip_to_temp(file_path, Path(dest_dir))
    if not is_supported_image(file_path):
        raise VLMParserError(f"Unsupported file type for photo upload: {file_path.name}")
    return [file_path]
