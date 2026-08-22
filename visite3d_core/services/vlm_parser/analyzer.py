import base64
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ...config import Config
from ...exceptions import CalibrationError, ClaudeAPIError, VLMParserError
from ...logger import get_logger
from ...utils.geometry import distance
from ...utils.image_io import imread_unicode
from ...utils.validators import require_file_exists
from .bloc1_5_section_detector import render_pdf_page
from .preprocessor import preprocess_plan
from .schema import (
    Opening,
    ParsedPlan,
    PhotoAnalysis,
    PlanGeometry,
    Point2D,
    Room,
    Stair,
    Wall,
)

PROMPTS_PATH = Path(__file__).parent / "templates" / "claude_prompts.json"


def _load_prompts() -> dict[str, Any]:
    with open(PROMPTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def _resolve_plan_image(plan_path: Path, config: Config) -> Path:
    """Return a raster image path for the given plan, rendering PDFs to PNG first."""
    if plan_path.suffix.lower() == ".pdf":
        image_path, _page_count = render_pdf_page(plan_path, config, page_number=0)
        return image_path
    return plan_path


def _parse_plan_opencv(plan_path: Path | str, config: Config) -> PlanGeometry:
    """Detect walls and rooms from a floor plan image using pure OpenCV contour geometry.

    Purely geometric: a 2-point contour becomes a wall, a 3+-point contour becomes
    a room. No semantics — rooms are never labeled and openings/stairs are never
    populated. Kept as a fallback for when no Claude API key is available.
    """
    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    plan_path = require_file_exists(plan_path)
    image_path = _resolve_plan_image(plan_path, config)

    opencv_config = config.get("services", "vlm_parser", "opencv", default={})
    result = preprocess_plan(image_path, opencv_config)
    contours = result["contours"]

    logger.info(f"parse_plan (opencv): {plan_path.name} -> {len(contours)} contours detected")

    walls: list[Wall] = []
    rooms: list[Room] = []
    openings: list[Opening] = []
    stairs: list[Stair] = []

    for idx, contour in enumerate(contours):
        approx = cv2.approxPolyDP(contour, 0.01 * cv2.arcLength(contour, True), True)
        points = [Point2D(x=float(p[0][0]), y=float(p[0][1])) for p in approx]

        if len(points) < 3:
            if len(points) == 2:
                walls.append(
                    Wall(id=f"wall_{idx}", start=points[0], end=points[1])
                )
            continue

        area = cv2.contourArea(contour)
        rooms.append(
            Room(id=f"room_{idx}", polygon=points, area_px=float(area))
        )

    return PlanGeometry(
        source_path=str(plan_path),
        walls=walls,
        rooms=rooms,
        openings=openings,
        stairs=stairs,
    )


def _percent_point(pt: dict[str, Any], width: int, height: int) -> Point2D:
    try:
        return Point2D(x=float(pt["x"]) * width, y=float(pt["y"]) * height)
    except (KeyError, TypeError, ValueError) as e:
        raise VLMParserError(f"Invalid point in Claude plan response: {pt!r}") from e


def parse_plan_with_vlm(plan_path: Path | str, config: Config) -> PlanGeometry:
    """Detect walls, rooms, openings and stairs from a floor plan image using Claude Vision.

    Unlike the pure-OpenCV path, this gives real semantic understanding: rooms get
    a label (salon, cuisine, chambre, ...), and doors/windows/stairs are detected.
    """
    try:
        import anthropic
    except ImportError as e:
        raise VLMParserError("anthropic package is required for parse_plan_with_vlm") from e

    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    plan_path = require_file_exists(plan_path)
    image_path = _resolve_plan_image(plan_path, config)

    image = imread_unicode(image_path)
    if image is None:
        raise VLMParserError(f"Could not read image: {image_path}")
    height, width = image.shape[:2]

    claude_config = config.get("services", "vlm_parser", "claude_api", default={})
    prompts = _load_prompts()["parse_plan"]

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
        logger.info(f"parse_plan_with_vlm failed for {plan_path.name}: {e}")
        raise ClaudeAPIError(f"Claude Vision plan analysis failed for {plan_path.name}: {e}") from e

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise VLMParserError(f"Claude returned invalid JSON for {plan_path.name}: {e}") from e

    if not isinstance(parsed, dict):
        raise VLMParserError(f"Claude response for {plan_path.name} is not a JSON object: {parsed!r}")

    for required_key in ("walls", "rooms"):
        if required_key not in parsed or not isinstance(parsed[required_key], list):
            raise VLMParserError(
                f"Claude response for {plan_path.name} is missing required list field "
                f"'{required_key}': {parsed!r}"
            )

    walls: list[Wall] = []
    for idx, w in enumerate(parsed.get("walls", [])):
        try:
            walls.append(
                Wall(
                    id=w.get("id") or f"wall_{idx}",
                    start=_percent_point(w["start"], width, height),
                    end=_percent_point(w["end"], width, height),
                )
            )
        except (KeyError, TypeError) as e:
            raise VLMParserError(f"Invalid wall entry in Claude response: {w!r}") from e

    openings: list[Opening] = []
    for idx, o in enumerate(parsed.get("openings", [])):
        try:
            openings.append(
                Opening(
                    id=o.get("id") or f"opening_{idx}",
                    type=o["type"],
                    wall_id=o.get("wall_id") or None,
                    position=_percent_point(o["position"], width, height),
                    width_px=float(o.get("width", 0.0)) * width,
                )
            )
        except (KeyError, TypeError, ValueError) as e:
            raise VLMParserError(f"Invalid opening entry in Claude response: {o!r}") from e

    rooms: list[Room] = []
    for idx, r in enumerate(parsed.get("rooms", [])):
        try:
            polygon = [_percent_point(p, width, height) for p in r.get("polygon", [])]
        except (KeyError, TypeError) as e:
            raise VLMParserError(f"Invalid room polygon in Claude response: {r!r}") from e
        area_px = 0.0
        if len(polygon) >= 3:
            pts = np.array([[p.x, p.y] for p in polygon], dtype=np.float32)
            area_px = float(cv2.contourArea(pts))
        rooms.append(
            Room(
                id=r.get("id") or f"room_{idx}",
                label=r.get("label"),
                polygon=polygon,
                area_px=area_px,
            )
        )

    stairs: list[Stair] = []
    for idx, s in enumerate(parsed.get("stairs", [])):
        try:
            polygon = [_percent_point(p, width, height) for p in s.get("polygon", [])]
        except (KeyError, TypeError) as e:
            raise VLMParserError(f"Invalid stair polygon in Claude response: {s!r}") from e
        stairs.append(Stair(id=s.get("id") or f"stair_{idx}", polygon=polygon))

    logger.info(
        f"parse_plan (vlm): {plan_path.name} -> {len(walls)} walls, {len(rooms)} rooms, "
        f"{len(openings)} openings, {len(stairs)} stairs"
    )

    return PlanGeometry(
        source_path=str(plan_path),
        walls=walls,
        rooms=rooms,
        openings=openings,
        stairs=stairs,
    )


def parse_plan(plan_path: Path | str, config: Config, method: str = "vlm") -> PlanGeometry:
    """Detect walls, rooms, openings and stairs from a floor plan image.

    method="vlm" (default) uses Claude Vision for real semantic understanding
    (room labels, openings, stairs). method="opencv" falls back to pure
    geometric contour detection (no labels, no openings, no stairs) — useful
    when no Claude API key is available, or for debugging the raw geometry.
    """
    if method == "vlm":
        return parse_plan_with_vlm(plan_path, config)
    elif method == "opencv":
        return _parse_plan_opencv(plan_path, config)
    raise VLMParserError(f"Unknown parse_plan method: {method!r} (expected 'vlm' or 'opencv')")


def analyze_photos(photo_paths: list[Path | str], config: Config) -> list[PhotoAnalysis]:
    """Extract textures and room labels from photos using Claude Vision."""
    try:
        import anthropic
    except ImportError as e:
        raise VLMParserError("anthropic package is required for analyze_photos") from e

    logger = get_logger("vlm_parser", config.path("paths", "logs"))
    claude_config = config.get("services", "vlm_parser", "claude_api", default={})
    prompts = _load_prompts()["analyze_photo"]

    client = anthropic.Anthropic()
    analyses: list[PhotoAnalysis] = []

    for photo_path in photo_paths:
        photo_path = require_file_exists(photo_path)
        media_type = "image/jpeg" if photo_path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
        image_data = base64.standard_b64encode(photo_path.read_bytes()).decode("utf-8")

        try:
            response = client.messages.create(
                model=claude_config.get("model", "claude-3-5-sonnet-20250514"),
                max_tokens=claude_config.get("max_tokens", 2000),
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
            parsed = json.loads(text)
            analyses.append(
                PhotoAnalysis(
                    source_path=str(photo_path),
                    room_label=parsed.get("room_label"),
                    textures=parsed.get("textures", {}),
                    notes=parsed.get("notes"),
                )
            )
        except Exception as e:
            logger.info(f"analyze_photos failed for {photo_path.name}: {e}")
            raise ClaudeAPIError(f"Claude Vision analysis failed for {photo_path.name}: {e}") from e

    return analyses


def apply_calibration(data: PlanGeometry, reference_length_m: float | None = None) -> PlanGeometry:
    """Compute pixels_per_meter and attach area_m2 to rooms.

    If reference_length_m is not given, falls back to the longest wall as a
    heuristic reference (caller should override with a known measurement).
    """
    if reference_length_m is not None:
        if not data.walls:
            raise CalibrationError("No walls detected to calibrate against")
        longest_wall = max(data.walls, key=lambda w: distance((w.start.x, w.start.y), (w.end.x, w.end.y)))
        wall_length_px = distance(
            (longest_wall.start.x, longest_wall.start.y),
            (longest_wall.end.x, longest_wall.end.y),
        )
        if wall_length_px <= 0:
            raise CalibrationError("Reference wall has zero length")
        pixels_per_meter = wall_length_px / reference_length_m
    elif data.pixels_per_meter:
        pixels_per_meter = data.pixels_per_meter
    else:
        raise CalibrationError("No calibration reference available")

    data.pixels_per_meter = pixels_per_meter
    for room in data.rooms:
        room.area_m2 = room.area_px / (pixels_per_meter ** 2)

    return data


def compute_pixels_per_meter_from_points(
    image_path: Path | str,
    point_a: dict[str, float],
    point_b: dict[str, float],
    reference_length_m: float,
) -> float:
    """Compute pixels_per_meter from two points the user picked on a plan
    image (each a {"x", "y"} dict of 0-1 fractions of image width/height, as
    drawn over a possibly-resized thumbnail) and the real-world length they
    measured between them (e.g. the width of a door)."""
    image_path = require_file_exists(image_path)
    image = imread_unicode(image_path)
    if image is None:
        raise VLMParserError(f"Could not read image for calibration: {image_path}")
    height, width = image.shape[:2]

    if reference_length_m <= 0:
        raise CalibrationError("Reference length must be positive")

    ax, ay = float(point_a["x"]) * width, float(point_a["y"]) * height
    bx, by = float(point_b["x"]) * width, float(point_b["y"]) * height
    pixel_distance = distance((ax, ay), (bx, by))
    if pixel_distance <= 0:
        raise CalibrationError("Calibration points have zero distance")

    return pixel_distance / reference_length_m


def output_geometry_json(data: ParsedPlan | PlanGeometry, config: Config, filename: str | None = None) -> Path:
    """Save parsed geometry (and optional photo analyses) as JSON to the output dir."""
    output_dir = config.path("paths", "generation")

    if isinstance(data, PlanGeometry):
        payload = ParsedPlan(geometry=data)
    else:
        payload = data

    source_name = Path(payload.geometry.source_path).stem
    out_name = filename or f"{source_name}_geometry.json"
    out_path = output_dir / out_name

    out_path.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    return out_path
