"""Bloc 1.5 vectorial format: the metric, semantically-rich JSON that Blender
consumes to generate 3D "very simply" — every dimension is already in real
units (meters / millimeters), so the importer just extrudes.

Distinct from schema.PlanGeometry, which is the raw pixel-space geometry
parse_plan() produces directly from the VLM. plan_geometry_to_vector()
converts a calibrated PlanGeometry (pixels_per_meter set via
analyzer.apply_calibration) into this format. vector_plan_to_svg() renders
it back to SVG for a lightweight UI preview.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from ...config import Config
from ...exceptions import VLMParserError
from ...utils.geometry import bbox_center
from .schema import PlanGeometry, Point2D

FORMAT_VERSION = "1.0.0"

# Default fill color per common room label (French labels used throughout
# the parse_plan / detect_sections prompts). Unmapped or unlabeled rooms
# fall back to rendering.colors.rooms_bg at render time.
ROOM_COLORS: dict[str, str] = {
    "salon": "#F5F5DC",
    "sejour": "#F5F5DC",
    "séjour": "#F5F5DC",
    "cuisine": "#FFE4B5",
    "chambre": "#E6E6FA",
    "salle de bain": "#B0E0E6",
    "salle_bain": "#B0E0E6",
    "couloir": "#D3D3D3",
    "entree": "#DEB887",
    "entrée": "#DEB887",
    "wc": "#ADD8E6",
    "bureau": "#F0E68C",
    "dressing": "#FFDAB9",
    "balcon": "#98FB98",
}

# px tolerance for deciding a wall endpoint sits on the plan's outer boundary
_BOUNDARY_TOLERANCE_PX = 2.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _point_to_m(pt: Point2D, pixels_per_meter: float) -> Point2D:
    return Point2D(x=pt.x / pixels_per_meter, y=pt.y / pixels_per_meter)


def _polygon_centroid_m(polygon_m: list[Point2D]) -> Point2D:
    if not polygon_m:
        return Point2D(x=0.0, y=0.0)
    cx, cy = bbox_center([(p.x, p.y) for p in polygon_m])
    return Point2D(x=cx, y=cy)


# ---------------------------------------------------------------------------
# metadata
# ---------------------------------------------------------------------------


class Calibration(BaseModel):
    pixels_per_meter: float
    origin: Point2D = Field(default_factory=lambda: Point2D(x=0.0, y=0.0))
    north_angle_degrees: float = 0.0
    reference_wall_length_meters: float | None = None


class VectorMetadata(BaseModel):
    version: str = FORMAT_VERSION
    created_at: str = Field(default_factory=_utc_now_iso)
    level: int
    section: str | None = None
    calibration: Calibration


# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------


class Bounds(BaseModel):
    min_x: float
    min_y: float
    max_x: float
    max_y: float
    width_meters: float
    height_meters: float
    area_m2: float


class VectorWall(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    thickness_mm: float = 200.0
    height_mm: float = 2800.0
    type: str = "interior"  # "interior" | "exterior"
    material: str | None = None
    label: str | None = None


class VectorRoom(BaseModel):
    id: str
    label: str | None = None
    centroid: Point2D
    area_m2: float
    polygon: list[Point2D] = Field(default_factory=list)
    color: str | None = None


class VectorOpening(BaseModel):
    id: str
    type: str  # "door" | "window" | "door_window"
    room_a: str | None = None
    room_b: str | None = None
    position: Point2D
    width_mm: float
    height_mm: float = 2100.0
    swing: str | None = None  # "left" | "right"


class VectorStair(BaseModel):
    id: str
    centroid: Point2D
    label: str | None = None
    steps: int | None = None
    width_mm: float | None = None


class VectorGeometry(BaseModel):
    bounds: Bounds
    walls: list[VectorWall] = Field(default_factory=list)
    rooms: list[VectorRoom] = Field(default_factory=list)
    openings: list[VectorOpening] = Field(default_factory=list)
    stairs: list[VectorStair] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# rendering (UI preview only — never consumed by Blender)
# ---------------------------------------------------------------------------


class RenderingColors(BaseModel):
    walls_exterior: str = "#2C3E50"
    walls_interior: str = "#34495E"
    rooms_bg: str = "#ECF0F1"
    doors: str = "#8B4513"
    windows: str = "#87CEEB"
    stairs: str = "#E74C3C"
    text: str = "#000000"


class RenderingConfig(BaseModel):
    scale: str = "1:100"
    unit: str = "meters"
    grid_mm: float = 50.0
    colors: RenderingColors = Field(default_factory=RenderingColors)
    stroke_width_mm: float = 10.0


class VectorPlan(BaseModel):
    metadata: VectorMetadata
    geometry: VectorGeometry
    rendering: RenderingConfig = Field(default_factory=RenderingConfig)


# ---------------------------------------------------------------------------
# PlanGeometry (pixel-space) -> VectorPlan (metric)
# ---------------------------------------------------------------------------


def plan_geometry_to_vector(
    geometry: PlanGeometry,
    level: int,
    section: str | None = None,
    north_angle_degrees: float = 0.0,
    reference_wall_length_meters: float | None = None,
) -> VectorPlan:
    """Convert a calibrated PlanGeometry into the metric VectorPlan format.

    geometry must already be calibrated (analyzer.apply_calibration having
    set geometry.pixels_per_meter) — vectorization only rescales existing
    pixel coordinates, it does not compute calibration itself.
    """
    if not geometry.pixels_per_meter:
        raise VLMParserError(
            "PlanGeometry must be calibrated (pixels_per_meter) before it can be vectorized "
            "— call analyzer.apply_calibration() first"
        )
    ppm = geometry.pixels_per_meter

    all_x = [p.x for w in geometry.walls for p in (w.start, w.end)]
    all_y = [p.y for w in geometry.walls for p in (w.start, w.end)]
    for r in geometry.rooms:
        all_x.extend(p.x for p in r.polygon)
        all_y.extend(p.y for p in r.polygon)
    if not all_x or not all_y:
        raise VLMParserError("Cannot vectorize an empty PlanGeometry (no walls or rooms)")

    min_x_px, max_x_px = min(all_x), max(all_x)
    min_y_px, max_y_px = min(all_y), max(all_y)

    def is_exterior(w) -> bool:
        # A wall is exterior only if it runs *along* one edge of the plan's
        # bounding box — not merely if each endpoint happens to touch some
        # edge (that also matches interior partitions spanning full height/width).
        dx = abs(w.end.x - w.start.x)
        dy = abs(w.end.y - w.start.y)
        if dx <= _BOUNDARY_TOLERANCE_PX:  # vertical wall
            x_mid = (w.start.x + w.end.x) / 2
            return abs(x_mid - min_x_px) <= _BOUNDARY_TOLERANCE_PX or abs(x_mid - max_x_px) <= _BOUNDARY_TOLERANCE_PX
        if dy <= _BOUNDARY_TOLERANCE_PX:  # horizontal wall
            y_mid = (w.start.y + w.end.y) / 2
            return abs(y_mid - min_y_px) <= _BOUNDARY_TOLERANCE_PX or abs(y_mid - max_y_px) <= _BOUNDARY_TOLERANCE_PX
        return False  # diagonal wall: default to interior

    vector_walls = [
        VectorWall(
            id=w.id,
            start=_point_to_m(w.start, ppm),
            end=_point_to_m(w.end, ppm),
            thickness_mm=(w.thickness_px / ppm) * 1000.0,
            type="exterior" if is_exterior(w) else "interior",
        )
        for w in geometry.walls
    ]

    vector_rooms = []
    for r in geometry.rooms:
        polygon_m = [_point_to_m(p, ppm) for p in r.polygon]
        vector_rooms.append(
            VectorRoom(
                id=r.id,
                label=r.label,
                centroid=_polygon_centroid_m(polygon_m),
                area_m2=r.area_m2 or 0.0,
                polygon=polygon_m,
                color=ROOM_COLORS.get((r.label or "").strip().lower()),
            )
        )

    vector_openings = [
        VectorOpening(
            id=o.id,
            type=o.type,
            position=_point_to_m(o.position, ppm),
            width_mm=(o.width_px / ppm) * 1000.0,
        )
        for o in geometry.openings
    ]

    vector_stairs = []
    for s in geometry.stairs:
        polygon_m = [_point_to_m(p, ppm) for p in s.polygon]
        vector_stairs.append(VectorStair(id=s.id, centroid=_polygon_centroid_m(polygon_m)))

    min_x_m, max_x_m = min_x_px / ppm, max_x_px / ppm
    min_y_m, max_y_m = min_y_px / ppm, max_y_px / ppm
    bounds = Bounds(
        min_x=min_x_m,
        min_y=min_y_m,
        max_x=max_x_m,
        max_y=max_y_m,
        width_meters=max_x_m - min_x_m,
        height_meters=max_y_m - min_y_m,
        area_m2=(max_x_m - min_x_m) * (max_y_m - min_y_m),
    )

    return VectorPlan(
        metadata=VectorMetadata(
            level=level,
            section=section,
            calibration=Calibration(
                pixels_per_meter=ppm,
                north_angle_degrees=north_angle_degrees,
                reference_wall_length_meters=reference_wall_length_meters,
            ),
        ),
        geometry=VectorGeometry(
            bounds=bounds,
            walls=vector_walls,
            rooms=vector_rooms,
            openings=vector_openings,
            stairs=vector_stairs,
        ),
    )


# ---------------------------------------------------------------------------
# output helpers
# ---------------------------------------------------------------------------


def output_vector_json(plan: VectorPlan, config: Config, filename: str | None = None) -> Path:
    """Save a VectorPlan as JSON to the output dir."""
    output_dir = config.path("paths", "generation")
    section = plan.metadata.section or "plan"
    out_name = filename or f"level{plan.metadata.level}_{section}_vector.json"
    out_path = output_dir / out_name
    out_path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    return out_path


def vector_plan_to_svg(plan: VectorPlan, px_per_meter: float = 40.0, errors: list | None = None) -> str:
    """Render a VectorPlan to SVG for a lightweight UI preview.

    Purely illustrative (uses rendering.colors) — never consumed by Blender,
    which reads the JSON geometry directly. When errors (a list of
    error_detector.PlanError, or any object with .error_id/.highlight) are
    given, each is drawn as a clickable marker (data-error-id) at its
    highlight position so the UI's error panel can scroll-and-flash it.
    """
    b = plan.geometry.bounds
    margin_m = 0.5
    width_px = (b.width_meters + 2 * margin_m) * px_per_meter
    height_px = (b.height_meters + 2 * margin_m) * px_per_meter

    def sx(x: float) -> float:
        return (x - b.min_x + margin_m) * px_per_meter

    def sy(y: float) -> float:
        return (y - b.min_y + margin_m) * px_per_meter

    colors = plan.rendering.colors
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_px:.1f}" height="{height_px:.1f}" '
        f'viewBox="0 0 {width_px:.1f} {height_px:.1f}">'
    ]

    for room in plan.geometry.rooms:
        if len(room.polygon) < 3:
            continue
        points = " ".join(f"{sx(p.x):.1f},{sy(p.y):.1f}" for p in room.polygon)
        fill = room.color or colors.rooms_bg
        parts.append(f'<polygon points="{points}" fill="{fill}" stroke="none" />')
        if room.label:
            parts.append(
                f'<text x="{sx(room.centroid.x):.1f}" y="{sy(room.centroid.y):.1f}" '
                f'fill="{colors.text}" font-size="12" text-anchor="middle">{room.label}</text>'
            )

    for wall in plan.geometry.walls:
        stroke = colors.walls_exterior if wall.type == "exterior" else colors.walls_interior
        stroke_width = max(1.0, (wall.thickness_mm / 1000.0) * px_per_meter)
        parts.append(
            f'<line x1="{sx(wall.start.x):.1f}" y1="{sy(wall.start.y):.1f}" '
            f'x2="{sx(wall.end.x):.1f}" y2="{sy(wall.end.y):.1f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width:.1f}" stroke-linecap="square" />'
        )

    for opening in plan.geometry.openings:
        color = colors.windows if opening.type == "window" else colors.doors
        r = max(2.0, (opening.width_mm / 1000.0 / 2) * px_per_meter)
        parts.append(f'<circle cx="{sx(opening.position.x):.1f}" cy="{sy(opening.position.y):.1f}" r="{r:.1f}" fill="{color}" />')

    for stair in plan.geometry.stairs:
        parts.append(
            f'<rect x="{sx(stair.centroid.x) - 8:.1f}" y="{sy(stair.centroid.y) - 8:.1f}" '
            f'width="16" height="16" fill="{colors.stairs}" />'
        )

    for err in errors or []:
        h = getattr(err, "highlight", None) or {}
        if "x" not in h or "y" not in h:
            continue
        cx, cy = sx(h["x"]), sy(h["y"])
        color = h.get("color", "#E74C3C")
        r = max(6.0, float(h.get("radius", 0.3)) * px_per_meter * 0.6)
        error_id = getattr(err, "error_id", "")
        parts.append(
            f'<g class="plan-error-marker" data-error-id="{error_id}">'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{color}" stroke-width="2.5" />'
            f'<line x1="{cx - r * 0.6:.1f}" y1="{cy - r * 0.6:.1f}" x2="{cx + r * 0.6:.1f}" y2="{cy + r * 0.6:.1f}" stroke="{color}" stroke-width="2.5" />'
            f'<line x1="{cx - r * 0.6:.1f}" y1="{cy + r * 0.6:.1f}" x2="{cx + r * 0.6:.1f}" y2="{cy - r * 0.6:.1f}" stroke="{color}" stroke-width="2.5" />'
            f"</g>"
        )

    parts.append("</svg>")
    return "\n".join(parts)


def output_vector_svg(plan: VectorPlan, config: Config, filename: str | None = None) -> Path:
    """Save the SVG preview of a VectorPlan to the output dir."""
    output_dir = config.path("paths", "generation")
    section = plan.metadata.section or "plan"
    out_name = filename or f"level{plan.metadata.level}_{section}_vector.svg"
    out_path = output_dir / out_name
    out_path.write_text(vector_plan_to_svg(plan), encoding="utf-8")
    return out_path
