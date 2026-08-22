import math
from typing import Sequence

Point = tuple[float, float]


def distance(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def polygon_area(points: Sequence[Point]) -> float:
    """Shoelace formula. Points must be ordered (CW or CCW)."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def pixels_to_meters(value_px: float, pixels_per_meter: float) -> float:
    if pixels_per_meter <= 0:
        raise ValueError("pixels_per_meter must be positive")
    return value_px / pixels_per_meter


def bbox_center(points: Sequence[Point]) -> Point:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)


def point_segment_distance(p: Point, a: Point, b: Point) -> float:
    """Shortest distance from point p to the segment a-b."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return distance(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj = (ax + t * dx, ay + t * dy)
    return distance(p, proj)


def point_in_polygon(p: Point, polygon: Sequence[Point]) -> bool:
    """Ray-casting point-in-polygon test. polygon is an ordered, implicitly-closed ring."""
    x, y = p
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y):
            x_intersect = (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
            if x < x_intersect:
                inside = not inside
        j = i
    return inside
