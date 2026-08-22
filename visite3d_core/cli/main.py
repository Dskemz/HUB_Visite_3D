from pathlib import Path

import click

from ..config import Config
from ..exceptions import Visite3DError
from ..logger import get_logger
from ..services.vlm_parser import (
    analyze_photos,
    apply_calibration,
    detect_sections,
    output_geometry_json,
    output_multi_level_json,
    parse_multi_pdf,
    parse_plan,
    validate_crop,
)


@click.group()
@click.option("--config", "config_path", type=click.Path(exists=True), default=None, help="Path to config JSON.")
@click.pass_context
def main(ctx: click.Context, config_path: str | None):
    """Visite3D automation engine CLI."""
    ctx.ensure_object(dict)
    ctx.obj["config"] = Config.load(config_path)


@main.command("parse-plan")
@click.argument("plan_path", type=click.Path(exists=True))
@click.option("--reference-length-m", type=float, default=None, help="Known length in meters of the longest wall, for calibration.")
@click.option(
    "--method",
    type=click.Choice(["vlm", "opencv"]),
    default="vlm",
    help="Parsing method: 'vlm' uses Claude Vision for semantic understanding (default), 'opencv' uses pure contour detection (fallback).",
)
@click.pass_context
def parse_plan_cmd(ctx: click.Context, plan_path: str, reference_length_m: float | None, method: str):
    """Parse a floor plan image into wall/room/opening geometry."""
    config: Config = ctx.obj["config"]
    logger = get_logger("cli", config.path("paths", "logs"))

    try:
        geometry = parse_plan(plan_path, config, method=method)
        if reference_length_m is not None:
            geometry = apply_calibration(geometry, reference_length_m=reference_length_m)
        out_path = output_geometry_json(geometry, config)
        logger.info(f"Wrote geometry to {out_path}")
        click.echo(str(out_path))
    except Visite3DError as e:
        raise click.ClickException(str(e)) from e


@main.command("analyze-photos")
@click.argument("photo_paths", type=click.Path(exists=True), nargs=-1, required=True)
@click.pass_context
def analyze_photos_cmd(ctx: click.Context, photo_paths: tuple[str, ...]):
    """Analyze room photos with Claude Vision to extract labels and textures."""
    config: Config = ctx.obj["config"]
    logger = get_logger("cli", config.path("paths", "logs"))

    try:
        analyses = analyze_photos([Path(p) for p in photo_paths], config)
        for analysis in analyses:
            click.echo(analysis.model_dump_json())
        logger.info(f"Analyzed {len(analyses)} photos")
    except Visite3DError as e:
        raise click.ClickException(str(e)) from e


@main.command("detect-sections")
@click.argument("source_path", type=click.Path(exists=True))
@click.option("--page-number", type=int, default=0, help="0-based PDF page index to analyze (ignored for plain images).")
@click.pass_context
def detect_sections_cmd(ctx: click.Context, source_path: str, page_number: int):
    """Bloc 1.5 step 1: detect privatif/commun sections on a full copropriete plan (PDF or image)."""
    config: Config = ctx.obj["config"]
    logger = get_logger("cli", config.path("paths", "logs"))

    try:
        result = detect_sections(source_path, config, page_number=page_number)
        click.echo(result.model_dump_json())
        logger.info(f"Detected {len(result.sections)} sections in {source_path}")
    except Visite3DError as e:
        raise click.ClickException(str(e)) from e


@main.command("validate-crop")
@click.argument("image_path", type=click.Path(exists=True))
@click.pass_context
def validate_crop_cmd(ctx: click.Context, image_path: str):
    """Bloc 1.5 step 2: ask Claude Vision whether a manually-cropped plan image is a single isolated private lot."""
    config: Config = ctx.obj["config"]
    logger = get_logger("cli", config.path("paths", "logs"))

    try:
        result = validate_crop(image_path, config)
        click.echo(result.model_dump_json())
        logger.info(f"validate-crop: {image_path} isolated={result.isolated}")
    except Visite3DError as e:
        raise click.ClickException(str(e)) from e


@main.command("parse-multi-pdf")
@click.argument("pdf_paths", type=click.Path(exists=True), nargs=-1, required=True)
@click.option("--target-lot", type=str, default=None, help="Lot label substring to prefer when several PRIVATIF sections are detected (e.g. 'C45').")
@click.option("--reference-length-m", type=float, default=None, help="Known length in meters of the longest wall, applied to calibrate every level.")
@click.pass_context
def parse_multi_pdf_cmd(ctx: click.Context, pdf_paths: tuple[str, ...], target_lot: str | None, reference_length_m: float | None):
    """Bloc 1.75: auto-detect level, auto-crop and parse a batch of multi-level plan PDFs."""
    config: Config = ctx.obj["config"]
    logger = get_logger("cli", config.path("paths", "logs"))

    try:
        result = parse_multi_pdf(list(pdf_paths), config, target_lot=target_lot, reference_length_m=reference_length_m)
        out_path = output_multi_level_json(result, config)
        click.echo(result.model_dump_json())
        logger.info(
            f"parse-multi-pdf: {len(result.levels)} level(s) ok, {len(result.failures)} failure(s) -> {out_path}"
        )
    except Visite3DError as e:
        raise click.ClickException(str(e)) from e


if __name__ == "__main__":
    main()
