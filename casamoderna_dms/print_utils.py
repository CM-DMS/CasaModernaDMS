"""print_utils.py — Jinja helpers for CasaModerna print formats.

Exposed to the Jinja environment via hooks.py → jinja.methods.
"""

from __future__ import annotations

import base64
import os

# Base directory where sofa measurement images are stored on disk.
# In production this is the Vite dist output served by nginx.
_SOFA_IMG_ROOT = "/home/frappe/ONE-CasaModernaDMS/frontend/dist"


def sofa_image_to_base64(url_path: str) -> str:
    """Convert a sofa image URL path to a base64 data URL for wkhtmltopdf.

    Args:
        url_path: Relative path like ``/sofa-measurements/LINEAR/CLARA_THREE_SEATER.webp``

    Returns:
        A ``data:image/webp;base64,...`` string, or empty string if the file
        doesn't exist (so the template can gracefully skip it).

    Example usage in a Jinja print format::

        {%- set b64 = sofa_image_to_base64(_sofa_img) -%}
        {%- if b64 -%}<img src="{{ b64 }}" style="..." />{%- endif -%}
    """
    if not url_path:
        return ""

    # Strip leading slash and resolve to absolute path.
    # In production the Vite app is served at /dms/, so getSofaMeasurementImage()
    # returns paths like "/dms/sofa-measurements/...".  The images on disk live
    # directly under _SOFA_IMG_ROOT (i.e. dist/sofa-measurements/...) with no
    # "dms" subdirectory, so we must strip any app base-path prefix.
    rel = url_path.lstrip("/")
    marker = "sofa-measurements/"
    idx = rel.find(marker)
    if idx > 0:
        # e.g. "dms/sofa-measurements/LINEAR/..." → "sofa-measurements/LINEAR/..."
        rel = rel[idx:]
    abs_path = os.path.join(_SOFA_IMG_ROOT, rel)

    if not os.path.isfile(abs_path):
        return ""

    ext = os.path.splitext(abs_path)[1].lower()
    mime = {
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }.get(ext, "image/webp")

    with open(abs_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode()

    return f"data:{mime};base64,{encoded}"
