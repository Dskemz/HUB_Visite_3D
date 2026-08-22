"""Bloc 1.75: multi-PDF orchestrator for multi-level properties.

Takes a batch of plan PDFs (typically 3, one per level of a duplex/triplex),
and for each one, fully automatically:

  1. detect_level()   — figures out which level (1, 2, 3, ...) the PDF is,
                         via a filename heuristic first, then Claude Vision
                         reading the "NIVEAU X" label off the page.
  2. render_pdf_page() + detect_sections() — rasterizes the page and finds
                         every PRIVATIF/COMMUN zone (Bloc 1.5).
  3. _select_target_section() + _crop_image() — auto-picks and crops the
                         relevant private lot (no manual click).
  4. validate_crop()  — Claude Vision re-checks the auto-crop is isolated.
  5. parse_plan()     — runs the full VLM plan parse on the crop.

Each level is processed independently: if one PDF fails at any stage, it is
logged and skipped, and the remaining PDFs still get processed. The
per-level PlanGeometry results are combined into one multi-level structure
suitable for downstream 3D reconstruction.
"""

import re
import uuid
from pathlib import Path

from ...config import Config
from ...exceptions import VLMParserError
from ...logger import get_logger
from ...utils.image_io import imread_unicode, imwrite_unicode
from ...utils.validators import require_file_exists
from .analyzer import apply_calibration, output_geometry_json, parse_plan
from .bloc1_5_section_detector import (
    _call_claude_vision,
    detect_sections,
    filter_private_sections,
    render_pdf_page,
    validate_crop,
)
from .schema import (
    BoundingBox,
    CropValidation,
    LevelFailure,
    LevelResult,
    MultiLevelResult,
    Section,
    SectionDetectionResult,
)

# Matches an explicit level marker in a filename, e.g. "plan_niveau_2.pdf",
# "NIVEAU-1.pdf", "etage3.pdf". Deliberately does NOT match a bare "n123"
# to avoid false positives on unrelated filenames.
_FILENAME_LEVEL_RE = re.compile(r"(?:niveau|level|lvl|etage)[\s_-]*0*(\d+)", re.IGNORECASE)


def _detect_level_from_filename(path: Path) -> int | None:
    match = _FILENAME_LEVEL_RE.search(path.stem)
    if match is None:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def detect_level(pdf_path: Path | str, config: Config) -> int:
    """Detect which building level a plan PDF belongs to.

    Tries a fast filename heuristic first (e.g. 'plan_niveau_2.pdf'), then
    falls back to Claude Vision reading the 'NIVEAU X' label directly off
    the rendered first page of the PDF.
    """
    pdf_path = require_file_exists(pdf_path)

    from_name = _detect_level_from_filename(pdf_path)
    if from_name is not None:
        return from_name

    image_path, _ = render_pdf_page(pdf_path, config, page_number=0)
    parsed = _call_claude_vision(image_path, "detect_level", config)

    if not isinstance(parsed, dict) or "level" not in parsed:
        raise VLMParserError(
            f"Claude response for {pdf_path.name} is missing required field 'level': {parsed!r}"
        )
    try:
        return int(parsed["level"])
    except (TypeError, ValueError) as e:
        raise VLMParserError(f"Claude returned a non-integer level for {pdf_path.name}: {parsed!r}") from e


def detect_level_and_sections(
    pdf_path: Path | str,
    config: Config,
    target_lot: str | None = None,
    page_number: int = 0,
) -> tuple[int, Path, SectionDetectionResult, Section | None]:
    """Combine level detection and section detection for one plan PDF, for the
    interactive editor flow: the caller gets back the rendered page image, every
    detected section (PRIVATIF/COMMUN), and the auto-picked target section to
    seed the crop tool with — the user still confirms or adjusts it before
    anything is parsed.
    """
    pdf_path = require_file_exists(pdf_path)
    level = detect_level(pdf_path, config)
    image_path, _page_count = render_pdf_page(pdf_path, config, page_number=page_number)
    section_result = detect_sections(pdf_path, config, page_number=page_number)
    private_sections = filter_private_sections(section_result)
    target_section = _select_target_section(private_sections, target_lot)
    return level, image_path, section_result, target_section


def crop_and_validate(image_path: Path | str, bbox: BoundingBox, config: Config) -> tuple[Path, CropValidation]:
    """Crop a rendered plan page to the user-confirmed bbox and re-check with
    Claude Vision that the crop is a single, well-isolated private lot."""
    image_path = require_file_exists(image_path)
    crop_path = _crop_image(image_path, bbox, config)
    validation = validate_crop(crop_path, config)
    return crop_path, validation


def parse_confirmed_levels(entries: list[dict], config: Config) -> MultiLevelResult:
    """Parse a batch of already-confirmed, already-calibrated crops (one per
    level), each entry being {"level", "crop_path", "pixels_per_meter" (optional),
    "source_path", "geometry" (optional)}. Mirrors parse_multi_pdf's per-level
    failure isolation, but skips detection/cropping since the interactive UI
    already did that. When "geometry" is already provided (the step 3.5
    vectorial-redraw pass already ran the VLM parse for this crop), it is
    reused as-is instead of paying for a second Claude Vision call."""
    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    levels: list[LevelResult] = []
    failures: list[LevelFailure] = []

    for entry in entries:
        level = entry["level"]
        crop_path = entry["crop_path"]
        source_path = entry.get("source_path") or str(crop_path)
        try:
            geometry = entry.get("geometry") or parse_plan(crop_path, config, method="vlm")
            pixels_per_meter = entry.get("pixels_per_meter")
            if pixels_per_meter:
                geometry.pixels_per_meter = pixels_per_meter
                geometry = apply_calibration(geometry)
            geometry_path = output_geometry_json(geometry, config, filename=f"level_{level}_geometry.json")

            levels.append(
                LevelResult(level=level, source_path=source_path, geometry=geometry, geometry_path=str(geometry_path))
            )
            logger.info(
                f"parse_confirmed_levels: level {level} parsed OK -> "
                f"{len(geometry.rooms)} rooms, {len(geometry.walls)} walls"
            )
        except Exception as e:
            logger.error(f"parse_confirmed_levels: level {level} failed: {e}")
            failures.append(LevelFailure(source_path=source_path, stage="parse_level", error=str(e), level=level))

    combined = _combine_levels(levels)
    logger.info(f"parse_confirmed_levels: {len(levels)} level(s) parsed OK, {len(failures)} failure(s)")

    return MultiLevelResult(levels=levels, combined=combined, failures=failures)


def _bbox_area(bbox: BoundingBox) -> float:
    return max(0.0, bbox.x_max - bbox.x_min) * max(0.0, bbox.y_max - bbox.y_min)


def _select_target_section(sections: list[Section], target_lot: str | None) -> Section | None:
    """Auto-pick the private lot to crop to: the PRIVATIF section whose label
    matches target_lot (e.g. 'C45') when given, otherwise the largest
    PRIVATIF section on the page."""
    if not sections:
        return None
    if target_lot:
        matches = [s for s in sections if target_lot.lower() in s.label.lower()]
        if matches:
            return max(matches, key=lambda s: _bbox_area(s.bbox))
    return max(sections, key=lambda s: _bbox_area(s.bbox))


def _crop_image(image_path: Path, bbox: BoundingBox, config: Config) -> Path:
    image = imread_unicode(image_path)
    if image is None:
        raise VLMParserError(f"Could not read image for cropping: {image_path}")
    height, width = image.shape[:2]

    x0 = max(0, min(width - 1, int(bbox.x_min * width)))
    y0 = max(0, min(height - 1, int(bbox.y_min * height)))
    x1 = max(x0 + 1, min(width, int(bbox.x_max * width)))
    y1 = max(y0 + 1, min(height, int(bbox.y_max * height)))

    crop = image[y0:y1, x0:x1]
    out_dir = config.path("paths", "temp")
    out_path = out_dir / f"{image_path.stem}_autocrop_{uuid.uuid4().hex[:8]}.png"
    imwrite_unicode(out_path, crop)
    return out_path


def _combine_levels(levels: list[LevelResult]) -> dict:
    """Merge per-level PlanGeometry results into one multi-level structure,
    namespacing every id with its level so downstream 3D reconstruction
    never collides ids across floors."""
    rooms: list[dict] = []
    walls: list[dict] = []
    openings: list[dict] = []
    stairs: list[dict] = []
    total_area_m2 = 0.0
    has_area = False

    for lr in sorted(levels, key=lambda l: l.level):
        g = lr.geometry
        for room in g.rooms:
            rooms.append(
                {
                    "id": f"L{lr.level}_{room.id}",
                    "level": lr.level,
                    "label": room.label,
                    "area_px": room.area_px,
                    "area_m2": room.area_m2,
                }
            )
            if room.area_m2 is not None:
                total_area_m2 += room.area_m2
                has_area = True
        for wall in g.walls:
            walls.append(
                {
                    "id": f"L{lr.level}_{wall.id}",
                    "level": lr.level,
                    "start": wall.start.model_dump(),
                    "end": wall.end.model_dump(),
                }
            )
        for opening in g.openings:
            openings.append(
                {
                    "id": f"L{lr.level}_{opening.id}",
                    "level": lr.level,
                    "type": opening.type,
                    "wall_id": f"L{lr.level}_{opening.wall_id}" if opening.wall_id else None,
                }
            )
        for stair in g.stairs:
            stairs.append({"id": f"L{lr.level}_{stair.id}", "level": lr.level})

    return {
        "level_count": len(levels),
        "levels": sorted(lr.level for lr in levels),
        "total_rooms": len(rooms),
        "total_area_m2": total_area_m2 if has_area else None,
        "rooms": rooms,
        "walls": walls,
        "openings": openings,
        "stairs": stairs,
    }


def parse_multi_pdf(
    pdf_paths: list[Path | str],
    config: Config,
    target_lot: str | None = None,
    reference_length_m: float | None = None,
) -> MultiLevelResult:
    """Auto-detect the level of every PDF, auto-crop each to its private lot,
    parse each independently, and combine the results into one multi-level
    structure. A failure on any single PDF is logged and skipped — it does
    not abort processing of the other PDFs.
    """
    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    failures: list[LevelFailure] = []

    detected: list[tuple[int, Path]] = []
    for raw_path in pdf_paths:
        try:
            path = require_file_exists(raw_path)
            level = detect_level(path, config)
            detected.append((level, path))
            logger.info(f"parse_multi_pdf: {path.name} -> level {level}")
        except Exception as e:
            logger.error(f"parse_multi_pdf: level detection failed for {raw_path}: {e}")
            failures.append(LevelFailure(source_path=str(raw_path), stage="detect_level", error=str(e)))

    detected.sort(key=lambda t: t[0])

    levels: list[LevelResult] = []
    for level, path in detected:
        try:
            image_path, _page_count = render_pdf_page(path, config, page_number=0)

            section_result = detect_sections(path, config, page_number=0)
            private_sections = filter_private_sections(section_result)
            target_section = _select_target_section(private_sections, target_lot)
            if target_section is None:
                raise VLMParserError(f"No PRIVATIF section found for level {level} in {path.name}")

            crop_path = _crop_image(image_path, target_section.bbox, config)

            crop_validation = validate_crop(crop_path, config)
            if not crop_validation.isolated:
                raise VLMParserError(
                    f"Auto-crop for level {level} ({path.name}) is not isolated: {crop_validation.reason}"
                )

            geometry = parse_plan(crop_path, config, method="vlm")
            if reference_length_m is not None:
                geometry = apply_calibration(geometry, reference_length_m=reference_length_m)
            geometry_path = output_geometry_json(geometry, config, filename=f"level_{level}_geometry.json")

            levels.append(
                LevelResult(
                    level=level,
                    source_path=str(path),
                    geometry=geometry,
                    geometry_path=str(geometry_path),
                )
            )
            logger.info(
                f"parse_multi_pdf: level {level} ({path.name}) parsed OK -> "
                f"{len(geometry.rooms)} rooms, {len(geometry.walls)} walls"
            )
        except Exception as e:
            logger.error(f"parse_multi_pdf: level {level} ({path.name}) failed: {e}")
            failures.append(LevelFailure(source_path=str(path), stage="parse_level", error=str(e), level=level))

    combined = _combine_levels(levels)

    logger.info(
        f"parse_multi_pdf: {len(levels)} level(s) parsed OK, {len(failures)} failure(s)"
    )

    return MultiLevelResult(levels=levels, combined=combined, failures=failures)


def output_multi_level_json(result: MultiLevelResult, config: Config, filename: str | None = None) -> Path:
    """Save the combined multi-level result as JSON to the output dir."""
    output_dir = config.path("paths", "generation")
    out_name = filename or "multi_level_geometry.json"
    out_path = output_dir / out_name
    out_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    return out_path
