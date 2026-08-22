"""Bloc 1.5: pre-processing step for complex copropriete plans.

Before the fine-grained parse_plan() step runs on a single isolated lot,
Bloc 1.5 helps the user go from a full copropriete PDF (which may show
several buildings, several lots and shared common areas) down to a clean
crop of just the buyer's private lot:

  1. detect_sections() — Claude Vision scans the full plan page and returns
     every distinct zone with a bounding box, labeled PRIVATIF or COMMUN.
  2. The caller (editor UI) lets the user drag/resize a crop box, seeded
     from a detected PRIVATIF zone.
  3. validate_crop() — Claude Vision re-checks the crop in isolation and
     answers whether it is a single, well-isolated private lot.

Only step 3 passing feeds into analyzer.parse_plan().
"""

import base64
import json
import re
from pathlib import Path
from typing import Any

from ...config import Config
from ...exceptions import ClaudeAPIError, VLMParserError
from ...logger import get_logger
from ...utils.validators import require_file_exists
from .schema import BoundingBox, CropValidation, Section, SectionDetectionResult

PROMPTS_PATH = Path(__file__).parent / "templates" / "claude_prompts.json"


def _load_prompts() -> dict[str, Any]:
    with open(PROMPTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _sanitize_filename_stem(stem: str) -> str:
    """Clean a filename stem for safe temp-file saving: ( ) [ ] { } and
    whitespace runs become underscores, consecutive underscores collapse to
    one, and leading/trailing underscores are stripped."""
    stem = re.sub(r"[()\[\]{}]", "_", stem)
    stem = re.sub(r"\s+", "_", stem)
    stem = re.sub(r"_+", "_", stem)
    return stem.strip("_")


def render_pdf_page(pdf_path: Path | str, config: Config, page_number: int = 0) -> tuple[Path, int]:
    """Rasterize one page of a PDF plan to a PNG image.

    Returns (image_path, page_count).
    """
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise VLMParserError("pymupdf package is required to read PDF plans") from e

    pdf_path = require_file_exists(pdf_path)
    doc = fitz.open(str(pdf_path))
    try:
        page_count = doc.page_count
        if not (0 <= page_number < page_count):
            raise VLMParserError(
                f"Page {page_number} out of range for {pdf_path.name} ({page_count} pages)"
            )
        page = doc.load_page(page_number)
        pix = page.get_pixmap(dpi=200)
        out_dir = config.path("paths", "temp")
        out_path = out_dir / f"{_sanitize_filename_stem(pdf_path.stem)}_p{page_number}.png"
        pix.save(str(out_path))
        return out_path, page_count
    finally:
        doc.close()


def _image_for_vlm(source_path: Path, config: Config, page_number: int) -> tuple[Path, int]:
    """Return (image_path, page_count) for the given source, rasterizing PDFs to PNG first."""
    if source_path.suffix.lower() == ".pdf":
        return render_pdf_page(source_path, config, page_number=page_number)
    return require_file_exists(source_path), 1


def _call_claude_vision(image_path: Path, prompt_key: str, config: Config) -> Any:
    try:
        import anthropic
    except ImportError as e:
        raise VLMParserError(f"anthropic package is required for {prompt_key}") from e

    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    claude_config = config.get("services", "vlm_parser", "claude_api", default={})
    logger.info(f"DEBUG: claude_config = {claude_config}")
    prompts = _load_prompts()[prompt_key]

    media_type = "image/jpeg" if image_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    image_data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")

    client = anthropic.Anthropic()
    try:
        response = client.messages.create(
            model=claude_config.get("model", "claude-3-5-sonnet-20250514"),
            max_tokens=claude_config.get("max_tokens", 4000),
            system=prompts["system"],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data,
                            },
                        },
                        {"type": "text", "text": prompts["user_template"]},
                    ],
                }
            ],
        )
        text = response.content[0].text
    except Exception as e:
        logger.info(f"{prompt_key} failed for {image_path.name}: {e}")
        raise ClaudeAPIError(f"Claude Vision '{prompt_key}' call failed for {image_path.name}: {e}") from e

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise VLMParserError(f"Claude returned invalid JSON for '{prompt_key}' on {image_path.name}: {e}") from e


def _bbox_from_dict(raw: dict[str, Any]) -> BoundingBox:
    try:
        return BoundingBox(
            x_min=float(raw["x_min"]),
            y_min=float(raw["y_min"]),
            x_max=float(raw["x_max"]),
            y_max=float(raw["y_max"]),
        )
    except (KeyError, TypeError, ValueError) as e:
        raise VLMParserError(f"Invalid bounding box in Claude response: {raw!r}") from e


def detect_sections(source_path: Path | str, config: Config, page_number: int = 0) -> SectionDetectionResult:
    """Step 1 of Bloc 1.5: detect every section/building/lot on a full
    copropriete plan (PDF or image) and classify each as PRIVATIF or COMMUN.

    The full result (including COMMUN zones) is returned for transparency in
    the UI; use filter_private_sections() to keep only the buyer's lot.
    """
    source_path = require_file_exists(source_path)
    image_path, page_count = _image_for_vlm(source_path, config, page_number)

    parsed = _call_claude_vision(image_path, "detect_sections", config)

    if not isinstance(parsed, dict) or not isinstance(parsed.get("sections"), list):
        raise VLMParserError(
            f"Claude response for {source_path.name} is missing required list field 'sections': {parsed!r}"
        )

    logger = get_logger("vlm_parser", config.path("paths", "logs"))

    sections: list[Section] = []
    for idx, s in enumerate(parsed["sections"]):
        try:
            zone_type = s.get("zone_type")
            if zone_type not in ("PRIVATIF", "COMMUN"):
                raise VLMParserError(
                    f"Invalid zone_type in Claude response (expected PRIVATIF or COMMUN): {s!r}"
                )
            sections.append(
                Section(
                    id=s.get("id") or f"section_{idx}",
                    label=s.get("label") or f"section_{idx}",
                    zone_type=zone_type,
                    bbox=_bbox_from_dict(s["bbox"]),
                    page=page_number,
                )
            )
        except KeyError as e:
            raise VLMParserError(f"Invalid section entry in Claude response: {s!r}") from e

    n_private = sum(1 for s in sections if s.zone_type == "PRIVATIF")
    n_common = sum(1 for s in sections if s.zone_type == "COMMUN")
    logger.info(
        f"detect_sections: {source_path.name} page {page_number} -> "
        f"{len(sections)} sections ({n_private} privatif, {n_common} commun)"
    )

    return SectionDetectionResult(
        source_path=str(source_path),
        page_count=page_count,
        sections=sections,
        image_path=str(image_path),
    )


def filter_private_sections(result: SectionDetectionResult) -> list[Section]:
    """Keep only PRIVATIF zones (rooms, terraces, private interior stairs,
    private garden), dropping COMMUN zones (shared garden/parking/staircase/...)."""
    return [s for s in result.sections if s.zone_type == "PRIVATIF"]


def validate_crop(image_path: Path | str, config: Config) -> CropValidation:
    """Step 2 of Bloc 1.5: after the user manually crops the plan around one
    lot, ask Claude Vision whether the crop is a single, well-isolated
    private lot (no COMMUN zones, no other lot bleeding in, no cut-off rooms).
    """
    image_path = require_file_exists(image_path)
    parsed = _call_claude_vision(image_path, "validate_crop", config)

    if not isinstance(parsed, dict) or "isolated" not in parsed:
        raise VLMParserError(
            f"Claude response for {image_path.name} is missing required field 'isolated': {parsed!r}"
        )

    return CropValidation(
        source_path=str(image_path),
        isolated=bool(parsed["isolated"]),
        reason=parsed.get("reason"),
    )
