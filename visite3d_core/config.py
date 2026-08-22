import json
from pathlib import Path
from typing import Any

from .exceptions import ConfigError

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "default.json"


class Config:
    def __init__(self, data: dict[str, Any], root: Path):
        self._data = data
        self._root = root

    @classmethod
    def load(cls, path: Path | str | None = None) -> "Config":
        config_path = Path(path) if path else DEFAULT_CONFIG_PATH
        if not config_path.exists():
            raise ConfigError(f"Config file not found: {config_path}")

        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)

        root = config_path.parent.parent.resolve()
        return cls(data, root)

    def get(self, *keys: str, default: Any = None) -> Any:
        node = self._data
        for key in keys:
            if not isinstance(node, dict) or key not in node:
                return default
            node = node[key]
        return node

    def path(self, *keys: str) -> Path:
        raw = self.get(*keys)
        if raw is None:
            raise ConfigError(f"Missing path config: {'.'.join(keys)}")
        resolved = (self._root / raw).resolve()
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved

    @property
    def root(self) -> Path:
        return self._root

    def __repr__(self) -> str:
        return f"Config(root={self._root})"
