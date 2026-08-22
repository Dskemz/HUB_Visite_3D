class Visite3DError(Exception):
    """Base exception for all visite3d_core errors."""


class ConfigError(Visite3DError):
    """Raised when configuration is missing or invalid."""


class VLMParserError(Visite3DError):
    """Raised when floor plan or photo parsing fails."""


class CalibrationError(VLMParserError):
    """Raised when pixel-to-meter calibration cannot be determined."""


class ClaudeAPIError(VLMParserError):
    """Raised when the Claude Vision API call fails."""
