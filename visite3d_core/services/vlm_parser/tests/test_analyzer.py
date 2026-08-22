import pytest

from visite3d_core.exceptions import CalibrationError
from visite3d_core.services.vlm_parser.analyzer import apply_calibration
from visite3d_core.services.vlm_parser.schema import PlanGeometry, Point2D, Room, Wall


def _geometry_with_wall(length_px: float) -> PlanGeometry:
    return PlanGeometry(
        source_path="fake_plan.png",
        walls=[Wall(id="wall_0", start=Point2D(x=0, y=0), end=Point2D(x=length_px, y=0))],
        rooms=[Room(id="room_0", polygon=[], area_px=length_px * length_px)],
    )


def test_apply_calibration_with_reference_length():
    geometry = _geometry_with_wall(length_px=200.0)
    result = apply_calibration(geometry, reference_length_m=4.0)

    assert result.pixels_per_meter == pytest.approx(50.0)
    assert result.rooms[0].area_m2 == pytest.approx((200.0 * 200.0) / (50.0 ** 2))


def test_apply_calibration_uses_existing_pixels_per_meter():
    geometry = _geometry_with_wall(length_px=200.0)
    geometry.pixels_per_meter = 25.0

    result = apply_calibration(geometry)

    assert result.pixels_per_meter == 25.0


def test_apply_calibration_raises_without_reference_or_walls():
    geometry = PlanGeometry(source_path="fake_plan.png")

    with pytest.raises(CalibrationError):
        apply_calibration(geometry, reference_length_m=4.0)


def test_apply_calibration_raises_with_no_calibration_source():
    geometry = _geometry_with_wall(length_px=200.0)

    with pytest.raises(CalibrationError):
        apply_calibration(geometry)
