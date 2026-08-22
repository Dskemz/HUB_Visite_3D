from pydantic import BaseModel, Field


class Point2D(BaseModel):
    x: float
    y: float


class Wall(BaseModel):
    id: str
    start: Point2D
    end: Point2D
    thickness_px: float = 10.0


class Opening(BaseModel):
    id: str
    type: str  # "door" | "window" | "door_window"
    wall_id: str | None = None
    position: Point2D
    width_px: float


class Room(BaseModel):
    id: str
    label: str | None = None
    polygon: list[Point2D] = Field(default_factory=list)
    area_px: float = 0.0
    area_m2: float | None = None


class Stair(BaseModel):
    id: str
    polygon: list[Point2D] = Field(default_factory=list)


class PlanGeometry(BaseModel):
    source_path: str
    pixels_per_meter: float | None = None
    walls: list[Wall] = Field(default_factory=list)
    rooms: list[Room] = Field(default_factory=list)
    openings: list[Opening] = Field(default_factory=list)
    stairs: list[Stair] = Field(default_factory=list)


class PhotoAnalysis(BaseModel):
    source_path: str
    room_label: str | None = None
    textures: dict[str, str] = Field(default_factory=dict)
    notes: str | None = None


class ParsedPlan(BaseModel):
    geometry: PlanGeometry
    photo_analyses: list[PhotoAnalysis] = Field(default_factory=list)


class BoundingBox(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float


class Section(BaseModel):
    id: str
    label: str
    zone_type: str  # "PRIVATIF" | "COMMUN"
    bbox: BoundingBox
    page: int = 0


class SectionDetectionResult(BaseModel):
    source_path: str
    page_count: int = 1
    sections: list[Section] = Field(default_factory=list)
    image_path: str | None = None


class CropValidation(BaseModel):
    source_path: str
    isolated: bool
    reason: str | None = None


class LevelResult(BaseModel):
    level: int
    source_path: str
    geometry: PlanGeometry
    geometry_path: str


class LevelFailure(BaseModel):
    source_path: str
    stage: str
    error: str
    level: int | None = None


class MultiLevelResult(BaseModel):
    levels: list[LevelResult] = Field(default_factory=list)
    combined: dict = Field(default_factory=dict)
    failures: list[LevelFailure] = Field(default_factory=list)
