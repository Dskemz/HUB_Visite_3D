"""Mini FastAPI server exposing Bloc 1 (parse-plan / analyze-photos) over HTTP.

Run with:
    python -m uvicorn visite3d_core.api.server:app --reload --port 8000
"""

import base64
import json
import subprocess
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..config import Config
from ..exceptions import Visite3DError
from ..services.upload_handler import handle_photo_upload
from ..services.vlm_parser import (
    Annotation,
    VectorPlan,
    apply_error_action,
    compute_pixels_per_meter_from_points,
    create_annotation,
    crop_and_validate,
    detect_level_and_sections,
    detect_plan_errors,
    parse_confirmed_levels,
    vector_plan_to_svg,
    vectorize_geometry,
    vectorize_level,
)
from ..services.vlm_parser.schema import BoundingBox
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Visite3D Bloc 1 API")

# The editor HTML is opened either as a local file (Origin: null) or served
# from a simple local dev server on some localhost/127.0.0.1 port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG = Config.load()

# In-memory state for the interactive plan editor workflow (/plan/detect ->
# /plan/crop -> /plan/vectorial-redraw -> /plan/calibrate -> /plan/finalize).
# This is a single-user local dev server, so a process-lifetime dict keyed by
# a random temp_id is enough to carry each PDF's rendered image / confirmed
# crop / parsed geometry / calibration / vectorial state across those steps
# without re-uploading or re-parsing anything.
_PLAN_SESSIONS: dict[str, dict] = {}

# Free-form notes the agent adds during the vectorial step, keyed by level.
_ANNOTATIONS: dict[int, list[Annotation]] = {}


class VectorialRedrawRequest(BaseModel):
    temp_id: str
    reference_wall_length_meters: float | None = None


class DetectErrorsRequest(BaseModel):
    vector_plan: dict


class ResolveErrorRequest(BaseModel):
    temp_id: str
    error_id: str
    action: str
    new_value: float | str | None = None


class AddAnnotationRequest(BaseModel):
    level: int
    text: str
    tags: list[str] = []


def _session_or_404(temp_id: str) -> dict:
    session = _PLAN_SESSIONS.get(temp_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session inconnue ou expirée — merci de relancer l'upload")
    return session


def _vectorial_payload(session: dict) -> dict:
    vector_plan: VectorPlan = session["vector_plan"]
    errors = [e for e in session["errors"] if e.error_id not in session["ignored_error_ids"]]
    svg = vector_plan_to_svg(vector_plan, errors=errors)
    g = vector_plan.geometry
    return {
        "stage": "vectorial_redraw",
        "level": vector_plan.metadata.level,
        "json": vector_plan.model_dump(),
        "svg": svg,
        "errors": [e.model_dump() for e in errors],
        "is_provisional": session["is_provisional"],
        "metadata": {
            "walls": len(g.walls),
            "rooms": len(g.rooms),
            "openings": len(g.openings),
            "doors": sum(1 for o in g.openings if o.type != "window"),
            "windows": sum(1 for o in g.openings if o.type == "window"),
            "stairs": len(g.stairs),
            "area_m2": g.bounds.area_m2,
        },
    }


def _save_upload(upload: UploadFile, dest_dir: Path) -> Path:
    # Keep the original filename (prefixed with a uuid for uniqueness) rather
    # than a bare uuid: detect_level()'s fast filename heuristic (e.g.
    # "plan_niveau_2.pdf") searches the saved path's stem, so discarding the
    # original name here would silently force every upload through the
    # (slower, costlier) Claude Vision fallback.
    original_name = Path(upload.filename or "upload").name
    dest_path = dest_dir / f"{uuid.uuid4().hex}_{original_name}"
    with open(dest_path, "wb") as f:
        f.write(upload.file.read())
    return dest_path


def _run_cli(*args: str) -> str:
    result = subprocess.run(
        [sys.executable, "-m", "visite3d_core.cli.main", *args],
        capture_output=True,
        text=True,
        cwd=str(CONFIG.root),
    )
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "CLI command failed"
        raise RuntimeError(message)
    return result.stdout


def _last_non_json_line(stdout: str) -> str:
    """CLI logs write JSON lines to stdout; the actual payload line is plain text."""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            json.loads(line)
        except json.JSONDecodeError:
            return line
    raise RuntimeError("CLI produced no usable output")


def _json_lines_with_key(stdout: str, key: str) -> list[dict]:
    """Pick out CLI-echoed JSON objects, ignoring interleaved log lines."""
    results = []
    for line in stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and key in data:
            results.append(data)
    return results


@app.get("/")
async def root():
    return {"service": "visite3d-bloc1-api", "status": "ok"}


@app.post("/parse-plan")
async def parse_plan_endpoint(
    plans: list[UploadFile] = File(...),
    target_lot: str | None = Form(default=None),
    reference_length_m: float | None = Form(default=None),
    method: str = Form(default="vlm"),
):
    """Single entry point for the '2D plan' block: upload 1 to 3 plan files.

    The caller never has to know which path ran — 1 file is a plain single-lot
    plan (Bloc 1's parse_plan), 2-3 files are treated as one plan per level of
    a multi-level property and go through the full auto-detect/auto-crop
    orchestrator (Bloc 1.75's parse_multi_pdf). Either way the response is one
    JSON result with a "mode" field telling the frontend which shape to read.
    """
    if not plans:
        raise HTTPException(status_code=400, detail="No plan files provided")
    if len(plans) > 3:
        raise HTTPException(status_code=400, detail="At most 3 plan files are supported")

    temp_dir = CONFIG.path("paths", "temp")
    saved_paths: list[Path] = []

    try:
        for plan in plans:
            saved_paths.append(_save_upload(plan, temp_dir))

        if len(saved_paths) == 1:
            args = ["parse-plan", str(saved_paths[0]), "--method", method]
            if reference_length_m is not None:
                args += ["--reference-length-m", str(reference_length_m)]

            stdout = _run_cli(*args)
            geometry_path = Path(_last_non_json_line(stdout))
            geometry = json.loads(geometry_path.read_text(encoding="utf-8"))

            return {
                "status": "done",
                "mode": "single",
                "geometry_path": str(geometry_path),
                "geometry": geometry,
            }

        args = ["parse-multi-pdf", *[str(p) for p in saved_paths]]
        if target_lot:
            args += ["--target-lot", target_lot]
        if reference_length_m is not None:
            args += ["--reference-length-m", str(reference_length_m)]

        stdout = _run_cli(*args)
        results = _json_lines_with_key(stdout, "levels")
        if not results:
            raise RuntimeError("CLI produced no usable output")
        result = results[0]

        return {
            "status": "done",
            "mode": "multi",
            "levels": result.get("levels", []),
            "combined": result.get("combined", {}),
            "failures": result.get("failures", []),
        }
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        for p in saved_paths:
            p.unlink(missing_ok=True)


@app.post("/detect-sections")
async def detect_sections_endpoint(
    plan: UploadFile = File(...),
    page_number: int = Form(default=0),
):
    """Bloc 1.5 step 1: detect privatif/commun sections on a full copropriete plan (PDF or image)."""
    temp_dir = CONFIG.path("paths", "temp")
    plan_path: Path | None = None

    try:
        plan_path = _save_upload(plan, temp_dir)

        stdout = _run_cli("detect-sections", str(plan_path), "--page-number", str(page_number))
        results = _json_lines_with_key(stdout, "sections")
        if not results:
            raise RuntimeError("CLI produced no usable output")
        result = results[0]

        image_b64 = None
        image_path = result.get("image_path")
        if image_path and Path(image_path).is_file():
            image_b64 = base64.standard_b64encode(Path(image_path).read_bytes()).decode("utf-8")

        return {
            "status": "done",
            "sections": result.get("sections", []),
            "page_count": result.get("page_count", 1),
            "image_base64": image_b64,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        if plan_path is not None:
            plan_path.unlink(missing_ok=True)


@app.post("/validate-crop")
async def validate_crop_endpoint(image: UploadFile = File(...)):
    """Bloc 1.5 step 2: check whether a manually-cropped plan image is a single isolated private lot."""
    temp_dir = CONFIG.path("paths", "temp")
    image_path: Path | None = None

    try:
        image_path = _save_upload(image, temp_dir)

        stdout = _run_cli("validate-crop", str(image_path))
        results = _json_lines_with_key(stdout, "isolated")
        if not results:
            raise RuntimeError("CLI produced no usable output")
        result = results[0]

        return {"status": "done", "isolated": result.get("isolated", False), "reason": result.get("reason")}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        if image_path is not None:
            image_path.unlink(missing_ok=True)


@app.post("/parse-multi-pdf")
async def parse_multi_pdf_endpoint(
    plans: list[UploadFile] = File(...),
    target_lot: str | None = Form(default=None),
    reference_length_m: float | None = Form(default=None),
):
    """Bloc 1.75: auto-detect level, auto-crop and parse a batch of multi-level plan PDFs."""
    if not plans:
        raise HTTPException(status_code=400, detail="No PDFs provided")

    temp_dir = CONFIG.path("paths", "temp")
    saved_paths: list[Path] = []

    try:
        for plan in plans:
            saved_paths.append(_save_upload(plan, temp_dir))

        args = ["parse-multi-pdf", *[str(p) for p in saved_paths]]
        if target_lot:
            args += ["--target-lot", target_lot]
        if reference_length_m is not None:
            args += ["--reference-length-m", str(reference_length_m)]

        stdout = _run_cli(*args)
        results = _json_lines_with_key(stdout, "levels")
        if not results:
            raise RuntimeError("CLI produced no usable output")
        result = results[0]

        return {
            "status": "done",
            "levels": result.get("levels", []),
            "combined": result.get("combined", {}),
            "failures": result.get("failures", []),
        }
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        for p in saved_paths:
            p.unlink(missing_ok=True)


@app.post("/plan/detect")
async def plan_detect_endpoint(
    plan: UploadFile = File(...),
    target_lot: str | None = Form(default=None),
):
    """Interactive editor step 1: detect the level + every PRIVATIF/COMMUN
    section on one plan PDF, and return a thumbnail so the UI can show the
    crop tool seeded with the auto-picked target section."""
    temp_dir = CONFIG.path("paths", "temp")
    pdf_path: Path | None = None

    try:
        pdf_path = _save_upload(plan, temp_dir)
        level, image_path, section_result, target_section = detect_level_and_sections(
            pdf_path, CONFIG, target_lot=target_lot
        )

        temp_id = uuid.uuid4().hex
        _PLAN_SESSIONS[temp_id] = {
            "image_path": image_path,
            "level": level,
            "source_name": plan.filename or image_path.name,
            "crop_path": None,
            "pixels_per_meter": None,
            "geometry": None,
            "vector_plan": None,
            "errors": [],
            "is_provisional": True,
            "ignored_error_ids": set(),
        }

        image_b64 = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")

        return {
            "status": "done",
            "temp_id": temp_id,
            "level": level,
            "image_base64": image_b64,
            "sections": [s.model_dump() for s in section_result.sections],
            "target_section": target_section.model_dump() if target_section else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        if pdf_path is not None:
            pdf_path.unlink(missing_ok=True)


@app.post("/plan/crop")
async def plan_crop_endpoint(
    temp_id: str = Form(...),
    x_min: float = Form(...),
    y_min: float = Form(...),
    x_max: float = Form(...),
    y_max: float = Form(...),
):
    """Interactive editor step 2: crop the detected plan page to the
    user-confirmed (or adjusted) box, and re-validate the isolation."""
    session = _PLAN_SESSIONS.get(temp_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session inconnue ou expirée — merci de relancer l'upload")

    try:
        bbox = BoundingBox(x_min=x_min, y_min=y_min, x_max=x_max, y_max=y_max)
        crop_path, validation = crop_and_validate(session["image_path"], bbox, CONFIG)
        session["crop_path"] = crop_path
        session["pixels_per_meter"] = None  # a new crop invalidates any prior calibration
        session["geometry"] = None  # ...and any prior VLM parse / vectorization
        session["vector_plan"] = None
        session["errors"] = []
        session["ignored_error_ids"] = set()

        image_b64 = base64.standard_b64encode(crop_path.read_bytes()).decode("utf-8")

        return {
            "status": "done",
            "isolated": validation.isolated,
            "reason": validation.reason,
            "crop_image_base64": image_b64,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/plan/calibrate")
async def plan_calibrate_endpoint(
    temp_id: str = Form(...),
    ax: float = Form(...),
    ay: float = Form(...),
    bx: float = Form(...),
    by: float = Form(...),
    reference_length_m: float = Form(...),
):
    """Interactive editor step 3: compute pixels_per_meter for the confirmed
    crop from two points the user picked (e.g. the two sides of a door) and
    the real-world length between them."""
    session = _PLAN_SESSIONS.get(temp_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session inconnue ou expirée — merci de relancer l'upload")
    crop_path = session.get("crop_path")
    if crop_path is None:
        raise HTTPException(status_code=400, detail="Aucune isolation confirmée pour ce plan")

    try:
        pixels_per_meter = compute_pixels_per_meter_from_points(
            crop_path,
            {"x": ax, "y": ay},
            {"x": bx, "y": by},
            reference_length_m,
        )
        session["pixels_per_meter"] = pixels_per_meter

        # Refresh the step 3.5 vectorization with the real scale, if it already ran
        # (provisional DEFAULT_PIXELS_PER_METER pass) — no need to re-parse via VLM.
        if session.get("geometry") is not None:
            vector_plan, errors, is_provisional = vectorize_geometry(
                session["geometry"],
                level=session["level"],
                pixels_per_meter=pixels_per_meter,
                reference_wall_length_meters=reference_length_m,
            )
            session["vector_plan"] = vector_plan
            session["errors"] = errors
            session["is_provisional"] = is_provisional

        return {"status": "done", "pixels_per_meter": pixels_per_meter}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/plan/vectorial-redraw")
async def plan_vectorial_redraw_endpoint(req: VectorialRedrawRequest):
    """Interactive editor step 3.5: run the VLM parse on a confirmed isolation
    crop (first call) and vectorize it — real calibration if the agent already
    ran step 4 for this level, otherwise a provisional DEFAULT_PIXELS_PER_METER
    scale so the SVG + non-dimensional errors are available immediately."""
    session = _session_or_404(req.temp_id)
    if session.get("crop_path") is None:
        raise HTTPException(status_code=400, detail="Aucune isolation confirmée pour ce plan")

    try:
        if session.get("geometry") is None:
            geometry, vector_plan, errors, is_provisional = vectorize_level(
                session["crop_path"],
                session["level"],
                CONFIG,
                pixels_per_meter=session.get("pixels_per_meter"),
                reference_wall_length_meters=req.reference_wall_length_meters,
            )
            session["geometry"] = geometry
        else:
            vector_plan, errors, is_provisional = vectorize_geometry(
                session["geometry"],
                level=session["level"],
                pixels_per_meter=session.get("pixels_per_meter"),
                reference_wall_length_meters=req.reference_wall_length_meters,
            )
        session["vector_plan"] = vector_plan
        session["errors"] = errors
        session["is_provisional"] = is_provisional

        return _vectorial_payload(session)
    except Visite3DError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.get("/plan/vectorial/{level}")
async def plan_vectorial_get_endpoint(level: int):
    """Level switcher: re-fetch the already-computed vectorial payload for a
    level the agent already stepped through, without recomputing anything."""
    session = next(
        (s for s in _PLAN_SESSIONS.values() if s.get("level") == level and s.get("vector_plan") is not None),
        None,
    )
    if session is None:
        raise HTTPException(status_code=404, detail=f"Aucune donnée vectorielle pour le niveau {level}")
    return _vectorial_payload(session)


@app.get("/plan/levels")
async def plan_levels_endpoint():
    """List every level currently confirmed (isolation done) in this session,
    split into above-ground levels and basements (level < 0)."""
    confirmed = [s["level"] for s in _PLAN_SESSIONS.values() if s.get("crop_path") is not None]
    levels = sorted({lv for lv in confirmed if lv >= 0})
    basements = sorted({lv for lv in confirmed if lv < 0}, reverse=True)
    return {"levels": levels, "basements": basements}


@app.post("/plan/detect-errors")
async def plan_detect_errors_endpoint(req: DetectErrorsRequest):
    """Stateless: re-run anomaly detection on any VectorPlan JSON payload."""
    try:
        vector_plan = VectorPlan.model_validate(req.vector_plan)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"vector_plan invalide: {e}") from e

    errors = detect_plan_errors(vector_plan)
    critical_count = sum(1 for e in errors if e.severity == "error")
    return {
        "errors": [e.model_dump() for e in errors],
        "count": len(errors),
        "critical_count": critical_count,
    }


@app.post("/plan/resolve-error")
async def plan_resolve_error_endpoint(req: ResolveErrorRequest):
    """Apply one error action (auto_fix / set_value / delete / ignore) to the
    session's current VectorPlan, re-detect, and return the refreshed state."""
    session = _session_or_404(req.temp_id)
    if session.get("vector_plan") is None:
        raise HTTPException(status_code=400, detail="Aucun plan vectoriel pour cette session — lancez /plan/vectorial-redraw d'abord")

    if req.action == "ignore":
        session["ignored_error_ids"].add(req.error_id)
    else:
        session["vector_plan"] = apply_error_action(session["vector_plan"], req.error_id, req.action, req.new_value)

    session["errors"] = detect_plan_errors(session["vector_plan"])

    payload = _vectorial_payload(session)
    return {
        "success": True,
        "updated_vector_plan": payload["json"],
        "svg": payload["svg"],
        "errors": payload["errors"],
    }


@app.post("/plan/add-annotation")
async def plan_add_annotation_endpoint(req: AddAnnotationRequest):
    annotation = create_annotation(req.level, req.text, req.tags)
    _ANNOTATIONS.setdefault(req.level, []).append(annotation)
    return {"annotation_id": annotation.annotation_id, "saved": True}


@app.get("/plan/annotations/{level}")
async def plan_get_annotations_endpoint(level: int):
    return {"annotations": [a.model_dump() for a in _ANNOTATIONS.get(level, [])]}


@app.post("/upload/photos")
async def upload_photos_endpoint(photos: list[UploadFile] = File(...)):
    """Bloc 1.5 photo dropzone: accept individual images and/or ZIP archives
    in the same multipart request — each ZIP is extracted server-side and
    every image inside it is returned alongside any individually-uploaded ones.

    Unlike /analyze-photos (which consumes and deletes uploads in one shot),
    this endpoint's whole point is to hand back paths the agent can review as
    thumbnails (and remove individually) before analysis runs later — so the
    resulting image files are deliberately left on disk in paths.temp. Only
    the raw .zip archive itself is deleted once its contents are extracted.
    """
    if not photos:
        raise HTTPException(status_code=400, detail="Aucune photo fournie")

    temp_dir = CONFIG.path("paths", "temp")
    zips_to_cleanup: list[Path] = []
    results: list[dict] = []

    for photo in photos:
        saved_path = _save_upload(photo, temp_dir)
        from_zip = saved_path.suffix.lower() == ".zip"
        try:
            extracted = handle_photo_upload(saved_path, temp_dir)
        except Visite3DError as e:
            saved_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=f"{photo.filename}: {e}") from e
        if from_zip:
            zips_to_cleanup.append(saved_path)
        for p in extracted:
            results.append({"filename": p.name, "path": str(p), "from_zip": from_zip})

    for z in zips_to_cleanup:
        z.unlink(missing_ok=True)

    return {"status": "ok", "photos": results, "count": len(results)}


@app.get("/photos/thumb/{filename}")
async def photos_thumb_endpoint(filename: str):
    """Serve a thumbnail for a photo previously returned by /upload/photos.
    filename is looked up strictly by basename inside paths.temp — a
    traversal attempt ('../x', an absolute path) can never escape it."""
    temp_dir = CONFIG.path("paths", "temp")
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    file_path = (temp_dir / safe_name).resolve()
    if temp_dir.resolve() not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Photo introuvable")
    return FileResponse(file_path)


@app.post("/plan/finalize")
async def plan_finalize_endpoint(temp_ids: list[str] = Form(...)):
    """Interactive editor step 4: parse every confirmed crop (with its
    calibration, if any) and return the combined multi-level result."""
    entries = []
    not_confirmed = []

    for temp_id in temp_ids:
        session = _PLAN_SESSIONS.get(temp_id)
        if session is None or session.get("crop_path") is None:
            not_confirmed.append(temp_id)
            continue
        entries.append(
            {
                "level": session["level"],
                "crop_path": session["crop_path"],
                "pixels_per_meter": session.get("pixels_per_meter"),
                "source_path": session.get("source_name"),
                "geometry": session.get("geometry"),
            }
        )

    if not_confirmed:
        raise HTTPException(
            status_code=400,
            detail=f"Isolation non confirmée pour {len(not_confirmed)} plan(s) — confirmez chaque crop avant de parser",
        )
    if not entries:
        raise HTTPException(status_code=400, detail="Aucun plan confirmé à parser")

    try:
        result = parse_confirmed_levels(entries, CONFIG)
        payload = json.loads(result.model_dump_json())
        payload["status"] = "done"
        return payload
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        for temp_id in temp_ids:
            session = _PLAN_SESSIONS.pop(temp_id, None)
            if not session:
                continue
            for key in ("image_path", "crop_path"):
                p = session.get(key)
                if p:
                    Path(p).unlink(missing_ok=True)


@app.post("/analyze-photos")
async def analyze_photos_endpoint(
    photos: list[UploadFile] = File(default=[]),
    photo_paths: list[str] = Form(default=[]),
):
    """Analyze a batch of photos already on disk (photo_paths — e.g. paths
    /upload/photos previously returned for a ZIP's contents) and/or freshly
    uploaded ones (photos). Both may be combined in a single request."""
    if not photos and not photo_paths:
        raise HTTPException(status_code=400, detail="No photos provided")

    temp_dir = CONFIG.path("paths", "temp")
    saved_paths: list[Path] = [Path(p) for p in photo_paths]

    try:
        for photo in photos:
            saved_paths.append(_save_upload(photo, temp_dir))

        stdout = _run_cli("analyze-photos", *[str(p) for p in saved_paths])
        analyses = _json_lines_with_key(stdout, "source_path")

        return {"status": "done", "analyses": analyses}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        for p in saved_paths:
            p.unlink(missing_ok=True)
