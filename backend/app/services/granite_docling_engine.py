"""Granite-Docling multimodal OCR engine (lab feature).

Wraps IBM's `docling` SDK (which uses granite-docling-258M under the hood)
to produce structured multimodal output from PDFs and images:
- Body text (preserved layout)
- Tables (with cell structure)
- Form fields & handwritten content
- Embedded images (with bounding boxes)
- Signatures (when detected)
- Layout tags (headings, paragraphs, lists, code)

This module uses **lazy imports** so the rest of the backend continues to
work even when the granite extras are not installed. Call
``GraniteDoclingEngine.is_available()`` before invoking ``process()`` to
detect a missing install gracefully.
"""
from __future__ import annotations

import base64
import io
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class TableElement:
    page_number: int
    rows: List[List[str]]
    bbox: Optional[List[float]] = None  # [x0, y0, x1, y1]
    caption: Optional[str] = None


@dataclass
class ImageElement:
    page_number: int
    bbox: Optional[List[float]] = None
    caption: Optional[str] = None
    # Base64-encoded PNG thumbnail for UI preview (small, ~10-50 KB)
    thumbnail_base64: Optional[str] = None


@dataclass
class FormFieldElement:
    page_number: int
    label: Optional[str] = None
    value: Optional[str] = None
    is_handwritten: bool = False


@dataclass
class SignatureElement:
    page_number: int
    bbox: Optional[List[float]] = None
    confidence: float = 0.0


@dataclass
class GraniteDoclingResult:
    """Structured multimodal output from a single document."""
    status: str  # "success" | "partial" | "failed"
    markdown: str = ""
    plain_text: str = ""
    page_count: int = 0
    tables: List[TableElement] = field(default_factory=list)
    images: List[ImageElement] = field(default_factory=list)
    form_fields: List[FormFieldElement] = field(default_factory=list)
    signatures: List[SignatureElement] = field(default_factory=list)
    headings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    processing_time_ms: float = 0.0
    error_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "markdown": self.markdown,
            "plain_text": self.plain_text,
            "page_count": self.page_count,
            "tables": [
                {
                    "page_number": t.page_number,
                    "rows": t.rows,
                    "bbox": t.bbox,
                    "caption": t.caption,
                }
                for t in self.tables
            ],
            "images": [
                {
                    "page_number": i.page_number,
                    "bbox": i.bbox,
                    "caption": i.caption,
                    "thumbnail_base64": i.thumbnail_base64,
                }
                for i in self.images
            ],
            "form_fields": [
                {
                    "page_number": f.page_number,
                    "label": f.label,
                    "value": f.value,
                    "is_handwritten": f.is_handwritten,
                }
                for f in self.form_fields
            ],
            "signatures": [
                {
                    "page_number": s.page_number,
                    "bbox": s.bbox,
                    "confidence": s.confidence,
                }
                for s in self.signatures
            ],
            "headings": self.headings,
            "element_counts": {
                "tables": len(self.tables),
                "images": len(self.images),
                "form_fields": len(self.form_fields),
                "signatures": len(self.signatures),
                "headings": len(self.headings),
            },
            "metadata": self.metadata,
            "processing_time_ms": self.processing_time_ms,
            "error_message": self.error_message,
        }


class GraniteDoclingEngine:
    """Multimodal OCR engine backed by IBM granite-docling-258M via the docling SDK."""

    MODEL_NAME = "ibm-granite/granite-docling-258M"

    def __init__(self) -> None:
        self._converter = None  # lazily initialized

    # ---- Availability ------------------------------------------------------

    @staticmethod
    def is_available() -> bool:
        """Return True if the docling SDK is importable in this environment."""
        try:
            import docling  # noqa: F401
            return True
        except ImportError:
            return False

    @classmethod
    def status(cls) -> Dict[str, Any]:
        """Lightweight health/install check for the UI."""
        info: Dict[str, Any] = {
            "available": cls.is_available(),
            "model": cls.MODEL_NAME,
            "engine": "granite-docling",
            "install_hint": (
                "pip install -r backend/requirements-granite.txt"
            ),
        }
        if info["available"]:
            try:
                import docling  # type: ignore
                info["docling_version"] = getattr(docling, "__version__", "unknown")
            except Exception:
                info["docling_version"] = "unknown"
        return info

    # ---- Conversion --------------------------------------------------------

    def _ensure_converter(self):
        """Lazily build the docling DocumentConverter on first use."""
        if self._converter is not None:
            return self._converter
        if not self.is_available():
            raise RuntimeError(
                "docling SDK not installed. Run: "
                "pip install -r backend/requirements-granite.txt"
            )
        from docling.document_converter import DocumentConverter  # type: ignore
        self._converter = DocumentConverter()
        return self._converter

    def process(self, file_path: Path) -> GraniteDoclingResult:
        """Process a file and return structured multimodal output.

        Supports PDFs, PNG, JPG, TIFF (and other formats supported by docling).
        """
        start = time.time()
        if not self.is_available():
            return GraniteDoclingResult(
                status="failed",
                error_message=(
                    "docling SDK not installed. Run: "
                    "pip install -r backend/requirements-granite.txt"
                ),
            )

        try:
            converter = self._ensure_converter()
            logger.info(f"[granite-docling] converting {file_path.name}")
            conv = converter.convert(str(file_path))
            doc = getattr(conv, "document", None)
            if doc is None:
                raise RuntimeError("docling returned no document")

            markdown = doc.export_to_markdown() if hasattr(doc, "export_to_markdown") else ""
            plain_text = doc.export_to_text() if hasattr(doc, "export_to_text") else markdown

            # Collect structural elements. The exact shape depends on the
            # docling version, so we defensively probe known attributes.
            tables = self._extract_tables(doc)
            images = self._extract_images(doc)
            form_fields = self._extract_form_fields(doc)
            signatures = self._extract_signatures(doc)
            headings = self._extract_headings(doc)
            page_count = self._guess_page_count(doc)

            elapsed = (time.time() - start) * 1000
            return GraniteDoclingResult(
                status="success",
                markdown=markdown,
                plain_text=plain_text,
                page_count=page_count,
                tables=tables,
                images=images,
                form_fields=form_fields,
                signatures=signatures,
                headings=headings,
                metadata={"engine": "granite-docling", "model": self.MODEL_NAME},
                processing_time_ms=elapsed,
            )
        except Exception as e:
            elapsed = (time.time() - start) * 1000
            logger.exception("[granite-docling] processing failed")
            return GraniteDoclingResult(
                status="failed",
                error_message=str(e),
                processing_time_ms=elapsed,
            )

    # ---- Element extractors (defensive against API drift) ------------------

    def _extract_tables(self, doc: Any) -> List[TableElement]:
        out: List[TableElement] = []
        tables = getattr(doc, "tables", None) or []
        for t in tables:
            try:
                rows: List[List[str]] = []
                # Try the table-data export first (cleanest)
                if hasattr(t, "export_to_dataframe"):
                    try:
                        # Newer docling versions expect the doc argument; older ones don't.
                        try:
                            df = t.export_to_dataframe(doc)
                        except TypeError:
                            df = t.export_to_dataframe()
                        rows = [list(map(str, df.columns))] + [
                            [str(c) for c in r] for r in df.values.tolist()
                        ]
                    except Exception:
                        pass
                if not rows:
                    # Fallback: walk cells
                    cells = getattr(t, "data", None) or getattr(t, "cells", None) or []
                    for row in cells:
                        if isinstance(row, list):
                            rows.append([str(c) for c in row])
                page = getattr(t, "page", None) or getattr(t, "page_no", 1)
                bbox = self._read_bbox(t)
                caption = getattr(t, "caption", None) or getattr(t, "label", None)
                out.append(TableElement(page_number=int(page or 1), rows=rows, bbox=bbox, caption=caption))
            except Exception as e:
                logger.warning(f"table extraction skipped: {e}")
        return out

    def _extract_images(self, doc: Any) -> List[ImageElement]:
        out: List[ImageElement] = []
        pictures = getattr(doc, "pictures", None) or []
        for p in pictures:
            try:
                page = getattr(p, "page", None) or getattr(p, "page_no", 1)
                bbox = self._read_bbox(p)
                caption = getattr(p, "caption", None)
                thumb = self._render_thumbnail(p)
                out.append(ImageElement(
                    page_number=int(page or 1),
                    bbox=bbox,
                    caption=caption,
                    thumbnail_base64=thumb,
                ))
            except Exception as e:
                logger.warning(f"image extraction skipped: {e}")
        return out

    def _extract_form_fields(self, doc: Any) -> List[FormFieldElement]:
        """Pull form fields from docling's key_value_items, form_items, and field_items."""
        out: List[FormFieldElement] = []

        # Track items already seen by self_ref so we don't double-count
        seen_refs: set = set()

        def _add_kv(key_text: Optional[str], value_text: Optional[str], page: int, handwritten: bool) -> None:
            out.append(FormFieldElement(
                page_number=int(page or 1),
                label=str(key_text) if key_text else None,
                value=str(value_text) if value_text else None,
                is_handwritten=handwritten,
            ))

        # 1) key_value_items — pairs of {key, value} text refs
        for kv in (getattr(doc, "key_value_items", None) or []):
            try:
                key_item = getattr(kv, "key", None) or getattr(kv, "graph", {}).get("key") if isinstance(getattr(kv, "graph", None), dict) else None
                val_item = getattr(kv, "value", None) or getattr(kv, "graph", {}).get("value") if isinstance(getattr(kv, "graph", None), dict) else None
                key_text = self._item_text(key_item, doc) if key_item is not None else None
                val_text = self._item_text(val_item, doc) if val_item is not None else None
                page = self._item_page(kv) or self._item_page(val_item) or 1
                hw = self._is_handwritten(val_item) or self._is_handwritten(key_item)
                if key_text or val_text:
                    _add_kv(key_text, val_text, page, hw)
                # mark refs as seen
                for ref in (getattr(kv, "self_ref", None), getattr(key_item, "self_ref", None), getattr(val_item, "self_ref", None)):
                    if ref:
                        seen_refs.add(ref)
            except Exception as e:
                logger.warning(f"key_value extraction skipped: {e}")

        # 2) field_items / form_items — single fields with optional value
        for fi in (getattr(doc, "field_items", None) or []) + (getattr(doc, "form_items", None) or []):
            try:
                label = getattr(fi, "label", None) or getattr(fi, "name", None)
                value = getattr(fi, "value", None) or getattr(fi, "text", None)
                page = self._item_page(fi) or 1
                hw = self._is_handwritten(fi)
                if label or value:
                    _add_kv(label, value, page, hw)
            except Exception as e:
                logger.warning(f"field item extraction skipped: {e}")

        # 3) Standalone HANDWRITTEN_TEXT runs that aren't already part of a kv pair
        for t in (getattr(doc, "texts", None) or []):
            try:
                ref = getattr(t, "self_ref", None)
                if ref and ref in seen_refs:
                    continue
                label = (getattr(t, "label", "") or "")
                label_str = label.value if hasattr(label, "value") else str(label)
                if label_str.lower() in ("handwritten_text", "handwritten"):
                    page = self._item_page(t) or 1
                    text = getattr(t, "text", None) or getattr(t, "orig", None)
                    _add_kv(None, text, page, True)
            except Exception as e:
                logger.warning(f"handwritten text scan skipped: {e}")

        return out

    def _extract_signatures(self, doc: Any) -> List[SignatureElement]:
        """Detect signatures heuristically.

        Docling 2.x has no native 'signature' label. Signatures are surfaced as:
        - text items labelled HANDWRITTEN_TEXT (most common)
        - picture elements whose caption / nearby text contains 'sign', 'signature',
          'signed by', 'commissioner', 'witness'
        """
        SIG_KEYWORDS = (
            "sign", "signature", "signed", "signed by",
            "commissioner", "witness", "ttd", "tanda tangan",
            "approved by", "authorized by",
        )

        out: List[SignatureElement] = []

        # Path A: HANDWRITTEN_TEXT items in doc.texts
        for t in (getattr(doc, "texts", None) or []):
            try:
                label = getattr(t, "label", None)
                label_str = (label.value if hasattr(label, "value") else str(label or "")).lower()
                if label_str in ("handwritten_text", "handwritten"):
                    page = self._item_page(t) or 1
                    bbox = self._read_bbox_from_prov(t)
                    out.append(SignatureElement(
                        page_number=int(page),
                        bbox=bbox,
                        confidence=0.85,
                    ))
            except Exception as e:
                logger.warning(f"signature (handwritten text) skipped: {e}")

        # Path B: pictures with signature-like caption / nearby text
        for p in (getattr(doc, "pictures", None) or []):
            try:
                # Combine all reference / caption text for this picture
                hint = " ".join(filter(None, [
                    str(getattr(p, "caption", "") or ""),
                    str(getattr(p, "label", "") or ""),
                    self._neighbouring_text(doc, p),
                ])).lower()
                if any(kw in hint for kw in SIG_KEYWORDS):
                    page = self._item_page(p) or 1
                    bbox = self._read_bbox_from_prov(p)
                    out.append(SignatureElement(
                        page_number=int(page),
                        bbox=bbox,
                        confidence=0.7,
                    ))
            except Exception as e:
                logger.warning(f"signature (picture) skipped: {e}")

        return out

    # ---- Small helpers used by the extractors ------------------------------

    @staticmethod
    def _is_handwritten(item: Any) -> bool:
        if item is None:
            return False
        label = getattr(item, "label", None)
        label_str = (label.value if hasattr(label, "value") else str(label or "")).lower()
        return label_str in ("handwritten_text", "handwritten")

    @staticmethod
    def _item_text(item: Any, doc: Any = None) -> Optional[str]:
        if item is None:
            return None
        # Direct text attr
        for attr in ("text", "orig"):
            v = getattr(item, attr, None)
            if v:
                return str(v)
        # cref → resolve via doc
        cref = getattr(item, "cref", None) or getattr(item, "self_ref", None)
        if cref and doc is not None:
            try:
                # naive cref resolve: scan doc.texts for matching self_ref
                for t in (getattr(doc, "texts", None) or []):
                    if getattr(t, "self_ref", None) == cref:
                        return getattr(t, "text", None) or getattr(t, "orig", None)
            except Exception:
                pass
        return None

    @staticmethod
    def _item_page(item: Any) -> Optional[int]:
        if item is None:
            return None
        for attr in ("page", "page_no"):
            v = getattr(item, attr, None)
            if isinstance(v, int):
                return v
        # Page from prov
        prov = getattr(item, "prov", None)
        if prov:
            try:
                first = prov[0] if isinstance(prov, (list, tuple)) and prov else prov
                pn = getattr(first, "page_no", None) or getattr(first, "page", None)
                if isinstance(pn, int):
                    return pn
            except Exception:
                pass
        return None

    @staticmethod
    def _read_bbox_from_prov(item: Any) -> Optional[List[float]]:
        prov = getattr(item, "prov", None)
        if not prov:
            return GraniteDoclingEngine._read_bbox(item)
        try:
            first = prov[0] if isinstance(prov, (list, tuple)) and prov else prov
            bbox = getattr(first, "bbox", None)
            if bbox is None:
                return None
            return GraniteDoclingEngine._read_bbox(type("X", (), {"bbox": bbox}))
        except Exception:
            return None

    @staticmethod
    def _neighbouring_text(doc: Any, picture: Any, max_items: int = 4) -> str:
        """Best-effort: return text from text items on the same page as the picture."""
        try:
            page = GraniteDoclingEngine._item_page(picture)
            if page is None:
                return ""
            chunks: List[str] = []
            for t in (getattr(doc, "texts", None) or []):
                if GraniteDoclingEngine._item_page(t) == page:
                    txt = getattr(t, "text", None) or getattr(t, "orig", None)
                    if txt:
                        chunks.append(str(txt))
                if len(chunks) >= max_items:
                    break
            return " ".join(chunks)
        except Exception:
            return ""

    def _extract_headings(self, doc: Any) -> List[str]:
        try:
            texts = getattr(doc, "texts", None) or []
            out: List[str] = []
            for t in texts:
                label = (getattr(t, "label", "") or "").lower()
                if label.startswith("heading") or label in ("section_header", "title"):
                    text = getattr(t, "text", None)
                    if text:
                        out.append(text.strip())
            return out
        except Exception:
            return []

    @staticmethod
    def _read_bbox(elt: Any) -> Optional[List[float]]:
        bbox = getattr(elt, "bbox", None) or getattr(elt, "bounding_box", None)
        if bbox is None:
            return None
        try:
            if hasattr(bbox, "l") and hasattr(bbox, "t"):
                return [float(bbox.l), float(bbox.t), float(bbox.r), float(bbox.b)]
            if hasattr(bbox, "x0"):
                return [float(bbox.x0), float(bbox.y0), float(bbox.x1), float(bbox.y1)]
            if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                return [float(b) for b in bbox[:4]]
        except Exception:
            return None
        return None

    @staticmethod
    def _render_thumbnail(picture: Any, max_size: int = 256) -> Optional[str]:
        """Return a small base64 PNG of the embedded image, or None on failure."""
        try:
            img = None
            if hasattr(picture, "image") and picture.image is not None:
                img = picture.image
            elif hasattr(picture, "get_image"):
                img = picture.get_image()
            if img is None:
                return None
            from PIL import Image  # type: ignore
            if not isinstance(img, Image.Image):
                # Some versions wrap in their own object — try common attrs
                if hasattr(img, "pil_image"):
                    img = img.pil_image
                else:
                    return None
            img = img.copy()
            img.thumbnail((max_size, max_size))
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode("ascii")
        except Exception:
            return None

    @staticmethod
    def _guess_page_count(doc: Any) -> int:
        for attr in ("num_pages", "page_count", "pages"):
            v = getattr(doc, attr, None)
            if isinstance(v, int):
                return v
            if isinstance(v, list):
                return len(v)
            if v is not None and hasattr(v, "__len__"):
                try:
                    return len(v)
                except Exception:
                    pass
        return 1


# Module-level singleton — keeps the model in memory between requests
_engine_singleton: Optional[GraniteDoclingEngine] = None


def get_engine() -> GraniteDoclingEngine:
    global _engine_singleton
    if _engine_singleton is None:
        _engine_singleton = GraniteDoclingEngine()
    return _engine_singleton
