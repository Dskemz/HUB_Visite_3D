"""Bloc 1.5 step 3.5: proactive anomaly detection on a VectorPlan.

Philosophy: the agent immobilier never goes looking for a mistake — the
system finds every anomaly up front, surfaces it in one prioritized list,
and offers a safe one-click fix wherever a fix cannot break the geometry.

detect_plan_errors() is pure (VectorPlan in, list[PlanError] out) so it can
run both server-side (API endpoints) and be re-run after any edit to refresh
the list. apply_error_action() is the only place that mutates a VectorPlan.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from ...utils.geometry import distance, point_in_polygon, point_segment_distance
from .vector_format import VectorPlan

# Norms (meters unless noted)
MIN_DOOR_WIDTH_M = 0.8
MIN_WINDOW_WIDTH_M = 0.4
MIN_ROOM_AREA_M2 = 5.0
MAX_INTERIOR_WALL_THICKNESS_M = 0.5
MAX_OPENING_TO_WALL_DISTANCE_M = 0.2
MAX_WALL_DENSITY_RATIO = 0.30
BEDROOM_LIVING_LABELS = {"chambre", "salon", "sejour", "séjour"}

_ERROR_COLOR = "#E74C3C"
_WARNING_COLOR = "#f5c451"


class PlanError(BaseModel):
    error_id: str
    severity: Literal["warning", "error"]
    type: str  # "geometry" | "connectivity" | "dimension" | "business" | "metadata"
    element_id: str
    element_label: str
    message: str
    current_value: float | None = None
    recommended_value: float | None = None
    highlight: dict = Field(default_factory=dict)  # {x, y, radius, color}
    actions: list[dict] = Field(default_factory=list)  # [{label, action, new_value?}]
    ignore_user: bool = False


def _highlight(x: float, y: float, severity: str, radius: float = 0.3) -> dict:
    return {"x": x, "y": y, "radius": radius, "color": _ERROR_COLOR if severity == "error" else _WARNING_COLOR}


def _nearest_even(n: int) -> int:
    if n % 2 == 0:
        return n
    return n + 1 if (n + 1) % 2 == 0 and abs((n + 1) - n) <= abs((n - 1) - n) else n - 1


def detect_plan_errors(vector_plan: VectorPlan) -> list[PlanError]:
    """Analyse a VectorPlan and return every detected anomaly, most-actionable
    fields first. Each PlanError carries its own highlight (for SVG overlay)
    and the safe action set the UI should offer."""
    g = vector_plan.geometry
    errors: list[PlanError] = []

    # ---------------------------------------------------------------- 1. geometry
    for room in g.rooms:
        if len(room.polygon) < 3:
            errors.append(
                PlanError(
                    error_id=f"{room.id}_unclosed",
                    severity="error",
                    type="geometry",
                    element_id=room.id,
                    element_label=f"Pièce {room.label or room.id}",
                    message="Polygone non fermé (moins de 3 points valides)",
                    highlight=_highlight(room.centroid.x, room.centroid.y, "error"),
                    actions=[{"label": "Ignorer", "action": "ignore"}],
                )
            )
        else:
            # consecutive near-duplicate vertices -> degenerate/self-touching edge
            dupes = any(
                distance((room.polygon[i].x, room.polygon[i].y), (room.polygon[i - 1].x, room.polygon[i - 1].y)) < 0.01
                for i in range(len(room.polygon))
            )
            if dupes:
                errors.append(
                    PlanError(
                        error_id=f"{room.id}_degenerate",
                        severity="warning",
                        type="geometry",
                        element_id=room.id,
                        element_label=f"Pièce {room.label or room.id}",
                        message="Polygone non fermé (points dupliqués/dégénérés)",
                        highlight=_highlight(room.centroid.x, room.centroid.y, "warning"),
                        actions=[
                            {"label": "Auto-corriger", "action": "auto_fix"},
                            {"label": "Ignorer", "action": "ignore"},
                        ],
                    )
                )

    def _connects(pt, exclude_idx) -> bool:
        # Connected if pt sits near another wall's endpoint (corner joint) or
        # anywhere along another wall's run (T-junction) — both are normal.
        for j, other in enumerate(g.walls):
            if j == exclude_idx:
                continue
            d = point_segment_distance(pt, (other.start.x, other.start.y), (other.end.x, other.end.y))
            if d < 0.05:
                return True
        return False

    for idx, w in enumerate(g.walls):
        start = (w.start.x, w.start.y)
        end = (w.end.x, w.end.y)
        if not _connects(start, idx) and not _connects(end, idx):
            mx, my = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
            errors.append(
                PlanError(
                    error_id=f"{w.id}_isolated",
                    severity="warning",
                    type="geometry",
                    element_id=w.id,
                    element_label=f"Mur {w.id}",
                    message="Segment de mur isolé (ne touche aucun autre mur)",
                    highlight=_highlight(mx, my, "warning"),
                    actions=[{"label": "Ignorer", "action": "ignore"}],
                )
            )

    for i, w1 in enumerate(g.walls):
        for w2 in g.walls[i + 1 :]:
            dx1, dy1 = w1.end.x - w1.start.x, w1.end.y - w1.start.y
            dx2, dy2 = w2.end.x - w2.start.x, w2.end.y - w2.start.y
            cross = dx1 * dy2 - dy1 * dx2
            len1 = (dx1**2 + dy1**2) ** 0.5
            len2 = (dx2**2 + dy2**2) ** 0.5
            if len1 < 1e-6 or len2 < 1e-6 or abs(cross) / (len1 * len2) > 0.02:
                continue  # not collinear
            d = point_segment_distance((w2.start.x, w2.start.y), (w1.start.x, w1.start.y), (w1.end.x, w1.end.y))
            if d > 0.05:
                continue  # collinear but on a different line
            # collinear + on the same line: check interval overlap along the shared axis
            axis = dx1 if abs(dx1) >= abs(dy1) else dy1
            def _t(pt):
                return (pt[0] - w1.start.x) if abs(dx1) >= abs(dy1) else (pt[1] - w1.start.y)
            t_a, t_b = sorted([0.0, axis])
            t_c, t_d = sorted([_t((w2.start.x, w2.start.y)), _t((w2.end.x, w2.end.y))])
            overlap = min(t_b, t_d) - max(t_a, t_c)
            if overlap > 0.15:
                mx, my = (w1.start.x + w1.end.x) / 2, (w1.start.y + w1.end.y) / 2
                errors.append(
                    PlanError(
                        error_id=f"{w1.id}_{w2.id}_overlap",
                        severity="warning",
                        type="geometry",
                        element_id=w1.id,
                        element_label=f"Murs {w1.id} / {w2.id}",
                        message=f"Murs qui se chevauchent sur {overlap:.2f} m",
                        current_value=overlap,
                        highlight=_highlight(mx, my, "warning"),
                        actions=[
                            {"label": "Supprimer le doublon", "action": "delete", "new_value": w2.id},
                            {"label": "Ignorer", "action": "ignore"},
                        ],
                    )
                )

    # ------------------------------------------------------------ 2. connectivity
    def _nearest_wall_distance(pos) -> float:
        if not g.walls:
            return float("inf")
        return min(
            point_segment_distance((pos.x, pos.y), (w.start.x, w.start.y), (w.end.x, w.end.y)) for w in g.walls
        )

    for o in g.openings:
        d = _nearest_wall_distance(o.position)
        if d > MAX_OPENING_TO_WALL_DISTANCE_M:
            kind = "Fenêtre" if o.type == "window" else "Porte"
            errors.append(
                PlanError(
                    error_id=f"{o.id}_floating",
                    severity="error",
                    type="connectivity",
                    element_id=o.id,
                    element_label=f"{kind} {o.id}",
                    message=f"{kind} flottante (à {d:.2f} m du mur le plus proche, max {MAX_OPENING_TO_WALL_DISTANCE_M} m)",
                    current_value=d,
                    recommended_value=0.0,
                    highlight=_highlight(o.position.x, o.position.y, "error"),
                    actions=[
                        {"label": "Placer sur le mur le plus proche", "action": "auto_fix"},
                        {"label": "Supprimer", "action": "delete"},
                    ],
                )
            )

    room_polys = [(r, [(p.x, p.y) for p in r.polygon]) for r in g.rooms if len(r.polygon) >= 3]
    for s in g.stairs:
        pos = (s.centroid.x, s.centroid.y)
        if not any(point_in_polygon(pos, poly) for _room, poly in room_polys):
            errors.append(
                PlanError(
                    error_id=f"{s.id}_disconnected",
                    severity="error",
                    type="connectivity",
                    element_id=s.id,
                    element_label=f"Escalier {s.label or s.id}",
                    message="Escalier non connecté (centroïde hors de toute pièce)",
                    highlight=_highlight(s.centroid.x, s.centroid.y, "error"),
                    actions=[{"label": "Ignorer", "action": "ignore"}],
                )
            )

    # -------------------------------------------------------------- 3. dimensions
    for o in g.openings:
        width_m = o.width_mm / 1000.0
        if o.type == "window":
            if width_m < MIN_WINDOW_WIDTH_M:
                errors.append(
                    PlanError(
                        error_id=f"{o.id}_too_small",
                        severity="error",
                        type="dimension",
                        element_id=o.id,
                        element_label=f"Fenêtre {o.id}",
                        message=f"Fenêtre trop petite ({width_m:.2f} m, min {MIN_WINDOW_WIDTH_M} m)",
                        current_value=width_m,
                        recommended_value=MIN_WINDOW_WIDTH_M,
                        highlight=_highlight(o.position.x, o.position.y, "error"),
                        actions=[
                            {"label": "Auto-corriger", "action": "auto_fix"},
                            {"label": "Ignorer", "action": "ignore"},
                            {"label": "Éditer", "action": "edit"},
                        ],
                    )
                )
        else:
            if width_m < MIN_DOOR_WIDTH_M:
                errors.append(
                    PlanError(
                        error_id=f"{o.id}_too_small",
                        severity="error",
                        type="dimension",
                        element_id=o.id,
                        element_label=f"Porte {o.id}",
                        message=f"Porte trop petite ({width_m:.2f} m, min {MIN_DOOR_WIDTH_M} m)",
                        current_value=width_m,
                        recommended_value=MIN_DOOR_WIDTH_M,
                        highlight=_highlight(o.position.x, o.position.y, "error"),
                        actions=[
                            {"label": "Auto-corriger", "action": "auto_fix"},
                            {"label": "Ignorer", "action": "ignore"},
                            {"label": "Éditer", "action": "edit"},
                        ],
                    )
                )

    for room in g.rooms:
        if room.area_m2 and room.area_m2 < MIN_ROOM_AREA_M2:
            errors.append(
                PlanError(
                    error_id=f"{room.id}_too_small",
                    severity="warning",
                    type="dimension",
                    element_id=room.id,
                    element_label=f"Pièce {room.label or room.id}",
                    message=f"Pièce anormalement petite ({room.area_m2:.1f} m², seuil {MIN_ROOM_AREA_M2} m²)",
                    current_value=room.area_m2,
                    recommended_value=MIN_ROOM_AREA_M2,
                    highlight=_highlight(room.centroid.x, room.centroid.y, "warning"),
                    actions=[{"label": "Ignorer", "action": "ignore"}],
                )
            )

    for w in g.walls:
        thickness_m = w.thickness_mm / 1000.0
        if w.type == "interior" and thickness_m > MAX_INTERIOR_WALL_THICKNESS_M:
            mx, my = (w.start.x + w.end.x) / 2, (w.start.y + w.end.y) / 2
            errors.append(
                PlanError(
                    error_id=f"{w.id}_too_thick",
                    severity="warning",
                    type="dimension",
                    element_id=w.id,
                    element_label=f"Mur {w.id}",
                    message=f"Mur intérieur anormalement épais ({thickness_m:.2f} m, seuil {MAX_INTERIOR_WALL_THICKNESS_M} m)",
                    current_value=thickness_m,
                    recommended_value=MAX_INTERIOR_WALL_THICKNESS_M,
                    highlight=_highlight(mx, my, "warning"),
                    actions=[
                        {"label": "Auto-corriger", "action": "auto_fix"},
                        {"label": "Ignorer", "action": "ignore"},
                        {"label": "Éditer", "action": "edit"},
                    ],
                )
            )

    # ------------------------------------------------------------------ 4. métier
    for s in g.stairs:
        if s.steps is not None and s.steps % 2 == 1:
            lower, upper = s.steps - 1, s.steps + 1
            errors.append(
                PlanError(
                    error_id=f"{s.id}_odd_steps",
                    severity="warning",
                    type="business",
                    element_id=s.id,
                    element_label=f"Escalier {s.label or s.id}",
                    message=f"Escalier avec un nombre impair de marches ({s.steps}, recommandé: pair)",
                    current_value=float(s.steps),
                    recommended_value=float(_nearest_even(s.steps)),
                    highlight=_highlight(s.centroid.x, s.centroid.y, "warning"),
                    actions=[
                        {"label": f"Ajuster à {lower}", "action": "set_value", "new_value": lower},
                        {"label": f"Ajuster à {upper}", "action": "set_value", "new_value": upper},
                        {"label": "Ignorer", "action": "ignore"},
                    ],
                )
            )

    window_positions = [(o.position.x, o.position.y) for o in g.openings if o.type in ("window", "door_window")]
    for room, poly in room_polys:
        label = (room.label or "").strip().lower()
        if label not in BEDROOM_LIVING_LABELS:
            continue
        has_window = any(point_in_polygon(wp, poly) for wp in window_positions)
        if not has_window:
            errors.append(
                PlanError(
                    error_id=f"{room.id}_no_window",
                    severity="warning",
                    type="business",
                    element_id=room.id,
                    element_label=f"Pièce {room.label}",
                    message=f"{room.label.capitalize()} sans fenêtre détectée",
                    highlight=_highlight(room.centroid.x, room.centroid.y, "warning"),
                    actions=[{"label": "Ignorer", "action": "ignore"}],
                )
            )

    wall_area_m2 = sum((w.thickness_mm / 1000.0) * distance((w.start.x, w.start.y), (w.end.x, w.end.y)) for w in g.walls)
    if g.bounds.area_m2 > 0 and (wall_area_m2 / g.bounds.area_m2) > MAX_WALL_DENSITY_RATIO:
        ratio = wall_area_m2 / g.bounds.area_m2
        errors.append(
            PlanError(
                error_id="plan_wall_density",
                severity="warning",
                type="business",
                element_id="plan",
                element_label="Plan entier",
                message=f"Densité de murs suspecte ({ratio * 100:.0f}% de l'aire, seuil {int(MAX_WALL_DENSITY_RATIO * 100)}%)",
                current_value=ratio,
                recommended_value=MAX_WALL_DENSITY_RATIO,
                actions=[{"label": "Ignorer", "action": "ignore"}],
            )
        )

    # -------------------------------------------------------------- 5. incohérence
    total_room_area = sum(r.area_m2 for r in g.rooms)
    if g.bounds.area_m2 > 0 and total_room_area > g.bounds.area_m2 * 1.02:
        errors.append(
            PlanError(
                error_id="plan_area_mismatch",
                severity="error",
                type="business",
                element_id="plan",
                element_label="Plan entier",
                message=(
                    f"Aire totale des pièces ({total_room_area:.1f} m²) supérieure à l'aire du bien "
                    f"({g.bounds.area_m2:.1f} m²)"
                ),
                current_value=total_room_area,
                recommended_value=g.bounds.area_m2,
                actions=[{"label": "Ignorer", "action": "ignore"}],
            )
        )

    if len(g.walls) > 0 and len(g.openings) > len(g.walls) * 2:
        errors.append(
            PlanError(
                error_id="plan_opening_count",
                severity="warning",
                type="business",
                element_id="plan",
                element_label="Plan entier",
                message=(
                    f"Nombre de portes/fenêtres suspect ({len(g.openings)}) par rapport au nombre de murs "
                    f"({len(g.walls)})"
                ),
                current_value=float(len(g.openings)),
                actions=[{"label": "Ignorer", "action": "ignore"}],
            )
        )

    return errors


# ---------------------------------------------------------------------------
# safe mutation
# ---------------------------------------------------------------------------


def apply_error_action(vector_plan: VectorPlan, error_id: str, action: str, new_value: float | str | None = None) -> VectorPlan:
    """Apply one resolve action to a VectorPlan and return the updated plan.

    "ignore" is a no-op here — the caller (API layer) is responsible for
    remembering which error_ids the agent chose to ignore so they don't
    reappear after the next detect_plan_errors() pass.
    """
    if action == "ignore":
        return vector_plan

    errors = {e.error_id: e for e in detect_plan_errors(vector_plan)}
    error = errors.get(error_id)
    if error is None:
        return vector_plan  # already resolved / stale id — nothing to do

    g = vector_plan.geometry

    if action in ("auto_fix", "set_value", "edit") and error.type == "dimension" and error.element_id.startswith(("door", "window", "opening")):
        target_width_m = float(new_value) if (action in ("set_value", "edit") and new_value is not None) else error.recommended_value
        if target_width_m is not None:
            for o in g.openings:
                if o.id == error.element_id:
                    o.width_mm = target_width_m * 1000.0

    elif action in ("auto_fix", "set_value", "edit") and error.type == "dimension" and error.element_id.startswith("wall"):
        target_thickness_m = float(new_value) if (action in ("set_value", "edit") and new_value is not None) else error.recommended_value
        if target_thickness_m is not None:
            for w in g.walls:
                if w.id == error.element_id:
                    w.thickness_mm = target_thickness_m * 1000.0

    elif action == "auto_fix" and error.type == "connectivity" and error.element_id.startswith(("door", "window", "opening")):
        opening = next((o for o in g.openings if o.id == error.element_id), None)
        if opening is not None and g.walls:
            best_wall, best_d, best_pt = None, float("inf"), None
            for w in g.walls:
                ax, ay = w.start.x, w.start.y
                bx, by = w.end.x, w.end.y
                dx, dy = bx - ax, by - ay
                px, py = opening.position.x, opening.position.y
                if dx == 0 and dy == 0:
                    t = 0.0
                else:
                    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
                proj = (ax + t * dx, ay + t * dy)
                d = distance((px, py), proj)
                if d < best_d:
                    best_wall, best_d, best_pt = w, d, proj
            if best_pt is not None:
                opening.position.x, opening.position.y = best_pt

    elif action == "delete":
        target = str(new_value) if new_value is not None else error.element_id
        g.openings = [o for o in g.openings if o.id != target]
        g.walls = [w for w in g.walls if w.id != target]

    elif action in ("auto_fix", "set_value", "edit") and error.type == "business" and error.element_id.startswith("stair"):
        target_steps = int(new_value) if (action in ("set_value", "edit") and new_value is not None) else (
            int(error.recommended_value) if error.recommended_value is not None else None
        )
        if target_steps is not None:
            for s in g.stairs:
                if s.id == error.element_id:
                    s.steps = target_steps

    elif action == "auto_fix" and error.type == "geometry" and error.element_id.startswith("room"):
        for room in g.rooms:
            if room.id == error.element_id and len(room.polygon) >= 3:
                deduped = [room.polygon[0]]
                for p in room.polygon[1:]:
                    if distance((p.x, p.y), (deduped[-1].x, deduped[-1].y)) >= 0.01:
                        deduped.append(p)
                room.polygon = deduped

    return vector_plan
