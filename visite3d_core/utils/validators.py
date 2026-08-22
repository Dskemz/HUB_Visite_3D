from pathlib import Path

SUPPORTED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def is_supported_image(path: Path | str) -> bool:
    return Path(path).suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS


def require_file_exists(path: Path | str) -> Path:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {p}")
    return p


def validate_pixels_per_meter(value: float) -> float:
    if value <= 0:
        raise ValueError(f"pixels_per_meter must be positive, got {value}")
    return value
