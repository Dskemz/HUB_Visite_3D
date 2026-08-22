"""Bloc 1.5 step 3.5 orchestration: isolation crop -> VLM parse -> provisional
vectorization -> error detection, in one call, before real calibration exists.

Vectorization (vector_format.plan_geometry_to_vector) requires a calibrated
PlanGeometry (pixels_per_meter set) — but this step runs *before* the
optional calibration step in the new UI order, so when no real calibration
is available yet we fall back to DEFAULT_PIXELS_PER_METER and mark the
result "provisional": the SVG and error list are still useful for spotting
topology/connectivity/business problems immediately, but any dimension-based
error (door/window/room too small, wall too thick) is only trustworthy once
the agent confirms or runs the real calibration step, which re-runs this
same conversion with the accurate pixels_per_meter and clears the flag.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, Field

from ...config import Config
from .analyzer import apply_calibration, parse_plan
from .error_detector import PlanError, detect_plan_errors
from .schema import PlanGeometry
from .vector_format import VectorPlan, plan_geometry_to_vector

DEFAULT_PIXELS_PER_METER = 100.0


class Annotation(BaseModel):
    annotation_id: str
    level: int
    text: str
    tags: list[str] = Field(default_factory=list)
    created_at: str


def create_annotation(level: int, text: str, tags: list[str] | None = None) -> Annotation:
    return Annotation(
        annotation_id=uuid.uuid4().hex,
        level=level,
        text=text,
        tags=tags or [],
        created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def vectorize_geometry(
    geometry: PlanGeometry,
    level: int,
    section: str | None = None,
    pixels_per_meter: float | None = None,
    reference_wall_length_meters: float | None = None,
) -> tuple[VectorPlan, list[PlanError], bool]:
    """Vectorize an already-parsed PlanGeometry (pixel-space), using real
    calibration when available or DEFAULT_PIXELS_PER_METER as a stand-in.

    Returns (vector_plan, errors, is_provisional).
    """
    is_provisional = not pixels_per_meter and not geometry.pixels_per_meter
    geometry.pixels_per_meter = pixels_per_meter or geometry.pixels_per_meter or DEFAULT_PIXELS_PER_METER
    geometry = apply_calibration(geometry)  # pixels_per_meter already set -> just fills room.area_m2

    vector_plan = plan_geometry_to_vector(
        geometry,
        level=level,
        section=section,
        reference_wall_length_meters=reference_wall_length_meters,
    )
    errors = detect_plan_errors(vector_plan)
    return vector_plan, errors, is_provisional


def vectorize_level(
    crop_path: Path | str,
    level: int,
    config: Config,
    section: str | None = None,
    pixels_per_meter: float | None = None,
    reference_wall_length_meters: float | None = None,
) -> tuple[PlanGeometry, VectorPlan, list[PlanError], bool]:
    """Run the VLM parse on a confirmed isolation crop, then vectorize it.

    Returns (geometry, vector_plan, errors, is_provisional) — geometry (pixel
    space) is kept by the caller so a later real calibration can re-run
    vectorize_geometry() without paying for another Claude Vision call.
    """
    geometry = parse_plan(crop_path, config, method="vlm")
    vector_plan, errors, is_provisional = vectorize_geometry(
        geometry,
        level=level,
        section=section,
        pixels_per_meter=pixels_per_meter,
        reference_wall_length_meters=reference_wall_length_meters,
    )
    return geometry, vector_plan, errors, is_provisional
