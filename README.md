# Visite3D

Automation engine for generating 3D virtual tours from floor plans and photos.

## Structure

- `public/` — existing web hub (untouched)
- `visite3d_core/` — Python automation package
  - `services/vlm_parser/` — floor plan analysis (OpenCV) + photo analysis (Claude Vision)
  - `cli/` — command-line entry point
  - `utils/` — geometry and validation helpers
- `assets/` — door/window 3D assets library
- `config/` — runtime configuration (`default.json`)
- `data/generation/` — pipeline output (GLB, logs, temp files)

## Install

```bash
pip install -e .
```

## Usage

```bash
visite3d --help
```
