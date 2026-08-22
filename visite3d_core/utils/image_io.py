"""Unicode-safe wrappers around cv2.imread/imwrite.

cv2.imread/imwrite open files via fopen() with the current C locale, which
silently fails (imread returns None, imwrite returns False) on Windows for
paths containing non-ASCII characters (e.g. accented letters). Routing
through numpy's own file I/O and cv2's buffer-based imdecode/imencode
sidesteps that limitation.
"""

from pathlib import Path

import cv2
import numpy as np


def imread_unicode(path: Path | str, flags: int = cv2.IMREAD_COLOR) -> np.ndarray | None:
    p = Path(path)
    if not p.is_file():
        return None
    data = np.fromfile(str(p), dtype=np.uint8)
    return cv2.imdecode(data, flags)


def imwrite_unicode(path: Path | str, image: np.ndarray) -> bool:
    p = Path(path)
    ok, encoded = cv2.imencode(p.suffix, image)
    if not ok:
        return False
    encoded.tofile(str(p))
    return True
