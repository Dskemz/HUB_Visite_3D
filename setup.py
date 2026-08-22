from setuptools import setup, find_packages

setup(
    name="visite3d",
    version="1.0.0-alpha",
    author="D (Dskemz)",
    description="Visite3D Automation Engine",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "opencv-python>=4.8.0",
        "anthropic>=0.40.0",
        "pillow>=10.0.0",
        "numpy>=1.24.0",
        "pydantic>=2.0.0",
        "click>=8.1.0",
        "exifread>=3.0.0",
        "fastapi>=0.110.0",
        "uvicorn>=0.29.0",
        "python-multipart>=0.0.9",
    ],
    entry_points={
        "console_scripts": [
            "visite3d=visite3d_core.cli.main:main",
        ],
    },
)
