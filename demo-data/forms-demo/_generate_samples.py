"""Generate two sample Security Guard Attendance Form PDFs.

Run from any directory:
    cd backend && .venv-granite/bin/python ../demo-data/forms-demo/_generate_samples.py

Outputs:
- security-attendance-blank.pdf   (REJECTED — no signature, no handwriting)
- security-attendance-filled.pdf  (APPROVED — synthetic handwritten + signature)
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT_DIR = Path(__file__).resolve().parent

# ── Try a handwriting-style font; fall back to italic Helvetica ─────────────
HANDWRITING_FONT = "Helvetica-Oblique"
for candidate in (
    "/System/Library/Fonts/Supplemental/Bradley Hand.ttc",
    "/System/Library/Fonts/Supplemental/Marker Felt.ttc",
    "/System/Library/Fonts/Supplemental/Chalkduster.ttf",
):
    p = Path(candidate)
    if p.exists():
        try:
            pdfmetrics.registerFont(TTFont("Handwriting", str(p)))
            HANDWRITING_FONT = "Handwriting"
            break
        except Exception:
            pass


def draw_form_template(c: canvas.Canvas, page_w: float, page_h: float) -> None:
    """Draw the printed parts of the attendance form (blank or filled)."""
    margin = 2 * cm
    y = page_h - margin

    # Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(margin, y, "SECURITY GUARD ATTENDANCE FORM")
    y -= 0.5 * cm
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(margin, y, "Form Daftar Hadir Satpam — PT Bangun Niaga Sentosa")
    y -= 0.3 * cm
    c.line(margin, y, page_w - margin, y)
    y -= 1.0 * cm

    # Two-column field grid
    label_x = margin
    line_x = margin + 4.5 * cm
    line_end = page_w - margin
    line_h = 0.75 * cm

    fields = [
        "Guard Name",
        "Guard ID",
        "Post / Location",
        "Shift (pagi / siang / malam)",
        "Attendance Date",
        "Check-in Time",
        "Check-out Time",
        "Supervisor Name",
    ]

    c.setFont("Helvetica", 11)
    for label in fields:
        c.drawString(label_x, y, label)
        c.setStrokeColor((0.6, 0.6, 0.6))
        c.line(line_x, y - 1, line_end, y - 1)
        y -= line_h

    # Incidents box
    y -= 0.4 * cm
    c.drawString(label_x, y, "Incidents Observed / Catatan")
    y -= 0.2 * cm
    box_top = y
    box_h = 3.5 * cm
    c.rect(label_x, y - box_h, line_end - label_x, box_h, stroke=1, fill=0)
    y -= box_h + 0.6 * cm

    # Signature lines (guard + supervisor)
    sig_w = (line_end - label_x - 1 * cm) / 2.0
    sig_y = y - 2.5 * cm
    # Guard signature box
    c.rect(label_x, sig_y, sig_w, 2.5 * cm, stroke=1, fill=0)
    c.setFont("Helvetica", 9)
    c.drawString(label_x + 0.2 * cm, sig_y + 0.2 * cm, "Guard Signature")
    # Supervisor signature box
    c.rect(label_x + sig_w + 1 * cm, sig_y, sig_w, 2.5 * cm, stroke=1, fill=0)
    c.drawString(label_x + sig_w + 1.2 * cm, sig_y + 0.2 * cm, "Supervisor Signature")

    # Return useful coordinates for filling
    return {
        "fields_top": page_h - margin - 1.5 * cm,
        "label_x": label_x,
        "line_x": line_x,
        "line_h": line_h,
        "incidents_top": box_top,
        "sig_y": sig_y,
        "sig_w": sig_w,
    }


def generate_blank() -> Path:
    out = OUT_DIR / "security-attendance-blank.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    page_w, page_h = A4
    draw_form_template(c, page_w, page_h)
    c.showPage()
    c.save()
    return out


def generate_filled() -> Path:
    out = OUT_DIR / "security-attendance-filled.pdf"
    c = canvas.Canvas(str(out), pagesize=A4)
    page_w, page_h = A4
    coords = draw_form_template(c, page_w, page_h)

    # ── Simulate handwritten field values with the handwriting font ──
    handwritten_values = [
        "Budi Santoso",            # Guard Name
        "SEC-04829",               # Guard ID
        "Gate A — Lobby Utama",    # Post
        "malam",                   # Shift
        "28 / 04 / 2026",          # Date
        "22:00",                   # Check-in
        "06:00",                   # Check-out
        "Pak Hendra Wijaya",       # Supervisor
    ]
    c.setFont(HANDWRITING_FONT, 13)
    c.setFillColorRGB(0.05, 0.10, 0.45)  # dark blue ink
    line_h = coords["line_h"]
    line_x = coords["line_x"]
    y = coords["fields_top"]
    for value in handwritten_values:
        c.drawString(line_x + 0.2 * cm, y - 1, value)
        y -= line_h

    # Incidents box — handwritten note
    c.setFont(HANDWRITING_FONT, 12)
    c.drawString(
        coords["label_x"] + 0.3 * cm,
        coords["incidents_top"] - 0.7 * cm,
        "01:30 — pintu loading dock kembali ditutup oleh shift sebelumnya",
    )
    c.drawString(
        coords["label_x"] + 0.3 * cm,
        coords["incidents_top"] - 1.4 * cm,
        "03:15 — patroli rutin lantai 1-3, kondisi aman",
    )

    # ── Draw a synthetic signature scribble in the Guard Signature box ──
    sig_y = coords["sig_y"]
    sig_w = coords["sig_w"]
    label_x = coords["label_x"]
    c.setStrokeColorRGB(0.05, 0.10, 0.45)
    c.setLineWidth(1.4)

    # A loopy signature path (just a series of bezier curves)
    path = c.beginPath()
    cx = label_x + 0.6 * cm
    cy = sig_y + 1.5 * cm
    path.moveTo(cx, cy)
    for offset, lift, ctrl in [
        (0.6 * cm, 0.5 * cm, 0.8 * cm),
        (1.2 * cm, -0.4 * cm, 0.6 * cm),
        (1.8 * cm, 0.6 * cm, 0.5 * cm),
        (2.5 * cm, -0.3 * cm, 0.7 * cm),
        (3.2 * cm, 0.4 * cm, 0.4 * cm),
        (3.9 * cm, 0.0 * cm, 0.3 * cm),
    ]:
        path.curveTo(
            cx + offset - 0.3 * cm, cy + lift,
            cx + offset, cy - ctrl + 0.3 * cm,
            cx + offset, cy + lift,
        )
    c.drawPath(path, stroke=1, fill=0)
    # A printed name beneath the scribble
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", 8)
    c.drawString(label_x + 0.3 * cm, sig_y + 0.4 * cm, "Budi Santoso (Guard)")

    c.showPage()
    c.save()
    return out


if __name__ == "__main__":
    blank = generate_blank()
    filled = generate_filled()
    print(f"Wrote: {blank}")
    print(f"Wrote: {filled}")
