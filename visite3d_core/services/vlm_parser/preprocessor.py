from pathlib import Path
from typing import Any

import cv2
import numpy as np

from ...exceptions import VLMParserError
from ...utils.image_io import imread_unicode


def load_image(path: Path | str) -> np.ndarray:
    p = Path(path)
    image = imread_unicode(p)
    if image is None:
        raise VLMParserError(f"Could not read image: {p}")
    return image


def to_grayscale(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def detect_edges(image: np.ndarray, threshold1: int = 50, threshold2: int = 150) -> np.ndarray:
    gray = to_grayscale(image) if image.ndim == 3 else image
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    return cv2.Canny(blurred, threshold1, threshold2)


def find_contours(edges: np.ndarray, min_area: float = 1000.0) -> list[np.ndarray]:
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    return [c for c in contours if cv2.contourArea(c) >= min_area]


def preprocess_plan(image_path: Path | str, opencv_config: dict[str, Any]) -> dict[str, Any]:
    image = load_image(image_path)
    edges = detect_edges(
        image,
        threshold1=opencv_config.get("edge_threshold1", 50),
        threshold2=opencv_config.get("edge_threshold2", 150),
    )
    contours = find_contours(edges, min_area=opencv_config.get("min_area", 1000))
    return {
        "image_shape": image.shape,
        "edges": edges,
        "contours": contours,
    }
