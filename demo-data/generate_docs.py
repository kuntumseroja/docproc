#!/usr/bin/env python3
"""
Generate demo PDF/image documents for DocProc demos.
Run: cd demo-data && python generate_docs.py
Requires: pymupdf (pip install pymupdf)
"""
import os
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Install pymupdf: pip install pymupdf")
    sys.exit(1)

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Colors
DARK = fitz.pdfcolor["gray20"]
MID = fitz.pdfcolor["gray50"]
LIGHT = fitz.pdfcolor["gray85"]
BLUE = (0.27, 0.54, 1.0)
GREEN = (0.14, 0.63, 0.28)
RED = (0.8, 0.15, 0.15)
WHITE = (1, 1, 1)


def draw_rect(page, rect, color, fill=None):
    shape = page.new_shape()
    shape.draw_rect(rect)
    shape.finish(color=color, fill=fill, width=0.5)
    shape.commit()


def add_text(page, pos, text, fontsize=10, fontname="helv", color=DARK, bold=False):
    fn = "hebo" if bold else fontname
    tw = fitz.TextWriter(page.rect)
    tw.append(pos, text, fontsize=fontsize, font=fitz.Font(fn))
    tw.write_text(page, color=color)
    return tw


def add_line(page, p1, p2, color=LIGHT, width=0.5):
    shape = page.new_shape()
    shape.draw_line(p1, p2)
    shape.finish(color=color, width=width)
    shape.commit()


# =============================================================================
# Invoice Generator
# =============================================================================
def create_invoice(filename, data):
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)  # Letter size

    # Header band
    draw_rect(page, fitz.Rect(0, 0, 612, 80), BLUE, fill=BLUE)
    add_text(page, (40, 35), data["vendor"], fontsize=22, color=WHITE, bold=True)
    add_text(page, (40, 58), data["vendor_address"], fontsize=9, color=WHITE)

    # INVOICE label
    add_text(page, (430, 35), "INVOICE", fontsize=24, color=WHITE, bold=True)

    # Invoice details box
    y = 100
    add_text(page, (400, y), "Invoice Number:", fontsize=9, color=MID)
    add_text(page, (500, y), data["invoice_number"], fontsize=9, bold=True)
    y += 18
    add_text(page, (400, y), "Invoice Date:", fontsize=9, color=MID)
    add_text(page, (500, y), data["invoice_date"], fontsize=9)
    y += 18
    add_text(page, (400, y), "Due Date:", fontsize=9, color=MID)
    add_text(page, (500, y), data["due_date"], fontsize=9)
    y += 18
    if data.get("po_number"):
        add_text(page, (400, y), "PO Number:", fontsize=9, color=MID)
        add_text(page, (500, y), data["po_number"], fontsize=9)

    # Bill To
    y = 100
    add_text(page, (40, y), "BILL TO", fontsize=8, color=MID, bold=True)
    y += 16
    add_text(page, (40, y), data["bill_to_name"], fontsize=10, bold=True)
    y += 15
    for line in data["bill_to_address"]:
        add_text(page, (40, y), line, fontsize=9, color=MID)
        y += 14

    # Line items table
    table_top = 220
    # Header row
    draw_rect(page, fitz.Rect(40, table_top, 572, table_top + 25), BLUE, fill=BLUE)
    add_text(page, (50, table_top + 8), "Description", fontsize=9, color=WHITE, bold=True)
    add_text(page, (340, table_top + 8), "Qty", fontsize=9, color=WHITE, bold=True)
    add_text(page, (400, table_top + 8), "Unit Price", fontsize=9, color=WHITE, bold=True)
    add_text(page, (500, table_top + 8), "Amount", fontsize=9, color=WHITE, bold=True)

    y = table_top + 25
    for i, item in enumerate(data["items"]):
        bg = WHITE if i % 2 == 0 else (0.97, 0.97, 0.97)
        draw_rect(page, fitz.Rect(40, y, 572, y + 22), LIGHT, fill=bg)
        add_text(page, (50, y + 6), item["desc"], fontsize=9)
        add_text(page, (350, y + 6), str(item["qty"]), fontsize=9)
        add_text(page, (400, y + 6), f"${item['price']:,.2f}", fontsize=9)
        add_text(page, (500, y + 6), f"${item['qty'] * item['price']:,.2f}", fontsize=9)
        y += 22

    # Totals
    y += 15
    add_line(page, (380, y), (572, y), color=LIGHT, width=1)
    y += 12
    add_text(page, (400, y), "Subtotal:", fontsize=10, color=MID)
    add_text(page, (500, y), f"${data['subtotal']:,.2f}", fontsize=10)
    y += 20
    add_text(page, (400, y), f"Tax ({data['tax_rate']}):", fontsize=10, color=MID)
    add_text(page, (500, y), f"${data['tax']:,.2f}", fontsize=10)
    y += 5
    add_line(page, (380, y + 10), (572, y + 10), color=DARK, width=1.5)
    y += 22
    add_text(page, (400, y), "TOTAL:", fontsize=12, bold=True)
    add_text(page, (500, y), f"${data['total']:,.2f}", fontsize=12, bold=True, color=BLUE)

    # Payment terms
    y += 45
    add_line(page, (40, y), (572, y), color=LIGHT)
    y += 15
    add_text(page, (40, y), "Payment Terms:", fontsize=9, color=MID, bold=True)
    add_text(page, (140, y), data.get("payment_terms", "Net 30"), fontsize=9)
    y += 15
    add_text(page, (40, y), "Payment Method:", fontsize=9, color=MID, bold=True)
    add_text(page, (140, y), "Bank Transfer / Wire", fontsize=9)

    # Footer
    add_line(page, (40, 740), (572, 740), color=LIGHT)
    add_text(page, (40, 755), "Thank you for your business!", fontsize=9, color=MID)
    add_text(page, (400, 755), f"{data['vendor']}", fontsize=8, color=MID)

    path = os.path.join(OUTPUT_DIR, filename)
    doc.save(path)
    doc.close()
    return path


# =============================================================================
# Receipt Generator
# =============================================================================
def create_receipt(filename, data):
    doc = fitz.open()
    # Receipts are narrow
    page = doc.new_page(width=300, height=500)

    # Store header
    y = 30
    add_text(page, (150 - len(data["merchant"]) * 4, y), data["merchant"], fontsize=14, bold=True)
    y += 18
    add_text(page, (150 - len(data["address"]) * 3, y), data["address"], fontsize=8, color=MID)
    y += 14
    if data.get("phone"):
        add_text(page, (150 - len(data["phone"]) * 3, y), data["phone"], fontsize=8, color=MID)
        y += 14

    # Dashed line
    y += 5
    add_line(page, (20, y), (280, y), color=MID)
    y += 15

    # Date & time
    add_text(page, (20, y), f"Date: {data['date']}", fontsize=9)
    add_text(page, (180, y), f"Time: {data['time']}", fontsize=9)
    y += 14
    if data.get("receipt_no"):
        add_text(page, (20, y), f"Receipt #: {data['receipt_no']}", fontsize=8, color=MID)
        y += 14

    y += 5
    add_line(page, (20, y), (280, y), color=MID)
    y += 12

    # Items
    for item in data["items"]:
        add_text(page, (20, y), item["name"], fontsize=9)
        add_text(page, (220, y), f"${item['price']:,.2f}", fontsize=9)
        y += 16
        if item.get("detail"):
            add_text(page, (30, y), item["detail"], fontsize=7, color=MID)
            y += 12

    # Totals
    y += 5
    add_line(page, (20, y), (280, y), color=MID)
    y += 12
    if data.get("subtotal"):
        add_text(page, (20, y), "Subtotal:", fontsize=9)
        add_text(page, (220, y), f"${data['subtotal']:,.2f}", fontsize=9)
        y += 16
    add_text(page, (20, y), "Tax:", fontsize=9)
    add_text(page, (220, y), f"${data['tax']:,.2f}", fontsize=9)
    y += 5
    add_line(page, (20, y + 10), (280, y + 10), color=DARK, width=1.5)
    y += 22
    add_text(page, (20, y), "TOTAL", fontsize=11, bold=True)
    add_text(page, (210, y), f"${data['total']:,.2f}", fontsize=11, bold=True)

    # Payment
    y += 25
    add_line(page, (20, y), (280, y), color=MID)
    y += 12
    add_text(page, (20, y), f"Payment: {data['payment']}", fontsize=9)
    if data.get("card_last4"):
        y += 14
        add_text(page, (20, y), f"Card: ****{data['card_last4']}", fontsize=8, color=MID)

    # Footer
    y += 25
    add_text(page, (70, y), "Thank you for visiting!", fontsize=9, color=MID)

    path = os.path.join(OUTPUT_DIR, filename)
    doc.save(path)
    doc.close()
    return path


# =============================================================================
# Contract Generator
# =============================================================================
def create_contract(filename, data):
    doc = fitz.open()

    # Page 1 — Cover/Title
    page = doc.new_page(width=612, height=792)
    draw_rect(page, fitz.Rect(0, 0, 612, 5), DARK, fill=DARK)
    draw_rect(page, fitz.Rect(0, 787, 612, 792), DARK, fill=DARK)

    y = 200
    add_text(page, (306 - len(data["title"]) * 6, y), data["title"], fontsize=24, bold=True)
    y += 50
    add_line(page, (200, y), (412, y), color=BLUE, width=2)
    y += 30
    add_text(page, (180, y), f"Between:  {data['party_a']}", fontsize=12)
    y += 22
    add_text(page, (180, y), f"And:         {data['party_b']}", fontsize=12)
    y += 40
    add_text(page, (180, y), f"Effective Date:  {data['effective_date']}", fontsize=10, color=MID)
    y += 18
    add_text(page, (180, y), f"Expiry Date:      {data['expiry_date']}", fontsize=10, color=MID)
    if data.get("contract_value"):
        y += 18
        add_text(page, (180, y), f"Contract Value:  ${data['contract_value']:,.2f}", fontsize=10, color=MID)

    add_text(page, (40, 750), "CONFIDENTIAL", fontsize=8, color=RED, bold=True)
    add_text(page, (480, 750), "Page 1", fontsize=8, color=MID)

    # Page 2+ — Terms
    for pg_num, section in enumerate(data["sections"], start=2):
        page = doc.new_page(width=612, height=792)
        draw_rect(page, fitz.Rect(0, 0, 612, 3), DARK, fill=DARK)

        y = 50
        add_text(page, (40, y), section["heading"], fontsize=14, bold=True, color=BLUE)
        y += 30

        for para in section["paragraphs"]:
            # Word wrap at ~85 chars
            words = para.split()
            line = ""
            for word in words:
                if len(line) + len(word) + 1 > 85:
                    add_text(page, (40, y), line, fontsize=10, color=DARK)
                    y += 15
                    line = word
                else:
                    line = f"{line} {word}".strip()
            if line:
                add_text(page, (40, y), line, fontsize=10, color=DARK)
                y += 15
            y += 10

            if y > 720:
                break

        add_text(page, (480, 750), f"Page {pg_num}", fontsize=8, color=MID)

    # Signature page
    page = doc.new_page(width=612, height=792)
    draw_rect(page, fitz.Rect(0, 0, 612, 3), DARK, fill=DARK)

    y = 80
    add_text(page, (40, y), "SIGNATURES", fontsize=16, bold=True)
    y += 15
    add_line(page, (40, y), (572, y), color=BLUE, width=1.5)
    y += 40

    add_text(page, (40, y), "IN WITNESS WHEREOF, the parties have executed this Agreement as of the", fontsize=10)
    y += 15
    add_text(page, (40, y), f"date first written above ({data['effective_date']}).", fontsize=10)

    # Party A signature block
    y += 60
    add_text(page, (40, y), f"For and on behalf of {data['party_a']}:", fontsize=10, bold=True)
    y += 40
    add_line(page, (40, y), (250, y), color=DARK)
    y += 12
    add_text(page, (40, y), "Authorized Signatory", fontsize=8, color=MID)
    y += 18
    add_text(page, (40, y), "Name: _______________________", fontsize=9)
    y += 18
    add_text(page, (40, y), "Title:  _______________________", fontsize=9)
    y += 18
    add_text(page, (40, y), "Date:  _______________________", fontsize=9)

    # Party B signature block
    y += 50
    add_text(page, (40, y), f"For and on behalf of {data['party_b']}:", fontsize=10, bold=True)
    y += 40
    add_line(page, (40, y), (250, y), color=DARK)
    y += 12
    add_text(page, (40, y), "Authorized Signatory", fontsize=8, color=MID)
    y += 18
    add_text(page, (40, y), "Name: _______________________", fontsize=9)
    y += 18
    add_text(page, (40, y), "Title:  _______________________", fontsize=9)
    y += 18
    add_text(page, (40, y), "Date:  _______________________", fontsize=9)

    # Governing law footer
    y += 50
    add_line(page, (40, y), (572, y), color=LIGHT)
    y += 15
    add_text(page, (40, y), f"Governing Law: {data['governing_law']}", fontsize=9, color=MID)
    if data.get("auto_renewal"):
        y += 14
        add_text(page, (40, y), f"Auto-Renewal: {data['auto_renewal']}", fontsize=9, color=MID)

    last_pg = len(data["sections"]) + 2
    add_text(page, (480, 750), f"Page {last_pg}", fontsize=8, color=MID)

    path = os.path.join(OUTPUT_DIR, filename)
    doc.save(path)
    doc.close()
    return path


# =============================================================================
# Generate All Demo Documents
# =============================================================================
def main():
    print("\n  Generating Demo Documents")
    print("  ========================\n")

    files = []

    # --- Invoices ---
    files.append(create_invoice("acme_inv_2024_001.pdf", {
        "vendor": "ACME Corporation",
        "vendor_address": "100 Innovation Drive, San Jose, CA 95134  |  accounts@acme.com",
        "invoice_number": "INV-2024-001",
        "invoice_date": "November 15, 2024",
        "due_date": "December 15, 2024",
        "po_number": "PO-2024-0892",
        "payment_terms": "Net 30",
        "bill_to_name": "DocProc Inc.",
        "bill_to_address": ["456 Enterprise Blvd, Suite 200", "Jakarta 12950, Indonesia"],
        "items": [
            {"desc": "Cloud Infrastructure — November 2024", "qty": 1, "price": 8500.00},
            {"desc": "API Gateway License (Monthly)", "qty": 1, "price": 2500.00},
            {"desc": "Technical Support — Premium Tier", "qty": 1, "price": 1500.00},
        ],
        "subtotal": 12500.00, "tax_rate": "10%", "tax": 1250.00, "total": 13750.00,
    }))

    files.append(create_invoice("globex_inv_9847.pdf", {
        "vendor": "Globex Industries",
        "vendor_address": "789 Manufacturing Way, Detroit, MI 48201  |  billing@globex.com",
        "invoice_number": "GLX-9847",
        "invoice_date": "November 20, 2024",
        "due_date": "January 19, 2025",
        "po_number": "",
        "payment_terms": "Net 60",
        "bill_to_name": "DocProc Inc.",
        "bill_to_address": ["456 Enterprise Blvd, Suite 200", "Jakarta 12950, Indonesia"],
        "items": [
            {"desc": "Industrial Scanner Unit (Model X200)", "qty": 5, "price": 4200.00},
            {"desc": "Scanner Maintenance Kit", "qty": 5, "price": 340.00},
            {"desc": "Installation & Calibration Service", "qty": 1, "price": 3500.00},
            {"desc": "Shipping & Handling (Freight)", "qty": 1, "price": 1000.00},
        ],
        "subtotal": 45200.00, "tax_rate": "8%", "tax": 3616.00, "total": 48816.00,
    }))

    files.append(create_invoice("stark_inv_7721.pdf", {
        "vendor": "Stark Enterprises",
        "vendor_address": "1 Stark Tower, New York, NY 10001  |  invoices@stark.com",
        "invoice_number": "STK-7721",
        "invoice_date": "December 1, 2024",
        "due_date": "December 31, 2024",
        "po_number": "",
        "payment_terms": "Net 30",
        "bill_to_name": "DocProc Inc.",
        "bill_to_address": ["456 Enterprise Blvd, Suite 200", "Jakarta 12950, Indonesia"],
        "items": [
            {"desc": "AI/ML Consulting — Architecture Review", "qty": 20, "price": 250.00},
            {"desc": "Model Training Workshop (2 days)", "qty": 1, "price": 3000.00},
        ],
        "subtotal": 8000.00, "tax_rate": "10%", "tax": 800.00, "total": 8800.00,
    }))

    files.append(create_invoice("wayne_inv_5500.pdf", {
        "vendor": "Wayne Industries",
        "vendor_address": "1007 Mountain Drive, Gotham City  |  ap@wayne.com",
        "invoice_number": "WI-5500",
        "invoice_date": "December 14, 2024",
        "due_date": "January 13, 2025",
        "po_number": "PO-2024-1105",
        "payment_terms": "Net 30",
        "bill_to_name": "DocProc Inc.",
        "bill_to_address": ["456 Enterprise Blvd, Suite 200", "Jakarta 12950, Indonesia"],
        "items": [
            {"desc": "Security Audit — Application Layer", "qty": 1, "price": 15000.00},
            {"desc": "Penetration Testing Report", "qty": 1, "price": 7500.00},
            {"desc": "Compliance Certificate Issuance", "qty": 1, "price": 2500.00},
        ],
        "subtotal": 25000.00, "tax_rate": "11%", "tax": 2750.00, "total": 27750.00,
    }))

    # Oscorp — intentionally low quality (simulate blurry scan)
    files.append(create_invoice("oscorp_inv_3300.pdf", {
        "vendor": "Oscorp Scientific",
        "vendor_address": "200 Lab Complex, Queens, NY  |  finance@oscorp.com",
        "invoice_number": "OSC-3300",
        "invoice_date": "December 8, 2024",
        "due_date": "January 7, 2025",
        "po_number": "",
        "payment_terms": "Net 30",
        "bill_to_name": "DocProc Inc.",
        "bill_to_address": ["456 Enterprise Blvd", "Jakarta, Indonesia"],
        "items": [
            {"desc": "Laboratory Equipment Rental", "qty": 1, "price": 6200.00},
            {"desc": "Chemical Analysis Services", "qty": 3, "price": 1800.00},
        ],
        "subtotal": 11600.00, "tax_rate": "10%", "tax": 1160.00, "total": 12760.00,
    }))

    # --- Receipts ---
    files.append(create_receipt("starbucks_receipt.pdf", {
        "merchant": "Starbucks Coffee",
        "address": "123 Main Street, Jakarta",
        "phone": "+62 21 5555 0123",
        "date": "December 10, 2024",
        "time": "09:15 AM",
        "receipt_no": "TXN-884521",
        "items": [
            {"name": "Grande Caffe Latte", "price": 5.95, "detail": "x2 = $11.90"},
            {"name": "Blueberry Muffin", "price": 3.95},
        ],
        "subtotal": 15.85, "tax": 1.43, "total": 17.28,
        "payment": "Visa", "card_last4": "4521",
    }))

    files.append(create_receipt("uber_receipt.pdf", {
        "merchant": "Uber",
        "address": "Trip Receipt",
        "date": "December 11, 2024",
        "time": "06:45 PM",
        "receipt_no": "UBER-9X2KL",
        "items": [
            {"name": "UberX Trip", "price": 42.50, "detail": "Office HQ → Airport T2 (28.3 km)"},
            {"name": "Driver Tip", "price": 8.50},
        ],
        "tax": 0.00, "total": 51.00,
        "payment": "Visa", "card_last4": "4521",
    }))

    files.append(create_receipt("hilton_receipt.pdf", {
        "merchant": "Hilton Hotels",
        "address": "Jl. Gatot Subroto, Jakarta",
        "phone": "+62 21 5555 9000",
        "date": "December 13, 2024",
        "time": "11:00 AM",
        "receipt_no": "FOLIO-28847",
        "items": [
            {"name": "Deluxe Room (Dec 11)", "price": 189.00},
            {"name": "Deluxe Room (Dec 12)", "price": 189.00},
        ],
        "subtotal": 378.00, "tax": 45.36, "total": 423.36,
        "payment": "Mastercard", "card_last4": "7832",
    }))

    files.append(create_receipt("office_depot_receipt.pdf", {
        "merchant": "Office Depot",
        "address": "45 Commerce Ave, Jakarta",
        "phone": "+62 21 5555 3456",
        "date": "December 15, 2024",
        "time": "02:30 PM",
        "receipt_no": "OD-554872",
        "items": [
            {"name": "A4 Paper (5 reams)", "price": 24.95},
            {"name": "Ink Cartridge — Black", "price": 34.99},
            {"name": "Ink Cartridge — Color", "price": 42.99},
            {"name": "Sticky Notes (12-pack)", "price": 8.49},
            {"name": "Ballpoint Pens (box)", "price": 6.99},
        ],
        "subtotal": 118.41, "tax": 11.84, "total": 130.25,
        "payment": "Corporate Card", "card_last4": "1199",
    }))

    # --- Contracts ---
    files.append(create_contract("saas_agreement_cloudflare.pdf", {
        "title": "SaaS Service Agreement",
        "party_a": "DocProc Inc.",
        "party_b": "Cloudflare Inc.",
        "effective_date": "January 1, 2025",
        "expiry_date": "December 31, 2025",
        "contract_value": 36000.00,
        "governing_law": "State of California, United States",
        "auto_renewal": "Yes — 30-day written notice required to cancel",
        "sections": [
            {
                "heading": "1. DEFINITIONS AND INTERPRETATION",
                "paragraphs": [
                    "1.1 In this Agreement, unless the context otherwise requires, the following terms shall have the meanings set out below:",
                    "\"Services\" means the cloud-based web performance and security services provided by the Provider, including CDN, DNS, DDoS protection, and WAF capabilities as described in Schedule A.",
                    "\"Service Level Agreement\" or \"SLA\" means the uptime and performance guarantees as specified in Schedule B, including 99.99% monthly uptime commitment.",
                    "\"Client Data\" means all data, content, and information uploaded, stored, or transmitted through the Services by or on behalf of the Client.",
                    "1.2 References to clauses and schedules are to clauses and schedules of this Agreement unless otherwise stated.",
                ]
            },
            {
                "heading": "2. SERVICES AND OBLIGATIONS",
                "paragraphs": [
                    "2.1 The Provider shall provide the Services to the Client in accordance with the terms of this Agreement and the applicable Service Level Agreement.",
                    "2.2 The Provider shall use commercially reasonable efforts to make the Services available 24 hours a day, 7 days a week, except for planned maintenance windows communicated at least 48 hours in advance.",
                    "2.3 The Client shall provide all necessary cooperation and access to information as may be required by the Provider in order to provide the Services.",
                    "2.4 The annual service fee of $36,000.00 (Thirty-Six Thousand US Dollars) shall be invoiced quarterly in advance at $9,000.00 per quarter.",
                ]
            },
            {
                "heading": "3. DATA PROTECTION AND SECURITY",
                "paragraphs": [
                    "3.1 The Provider shall implement and maintain appropriate technical and organizational measures to protect Client Data against unauthorized access, loss, or destruction.",
                    "3.2 The Provider shall comply with all applicable data protection laws, including but not limited to GDPR and local Indonesian data protection regulations (UU PDP).",
                    "3.3 In the event of a data breach affecting Client Data, the Provider shall notify the Client within 72 hours of becoming aware of the breach.",
                    "3.4 Upon termination of this Agreement, the Provider shall return or destroy all Client Data within 30 days, as directed by the Client.",
                ]
            },
            {
                "heading": "4. TERM AND TERMINATION",
                "paragraphs": [
                    "4.1 This Agreement shall commence on the Effective Date and continue for a period of twelve (12) months unless terminated earlier in accordance with this clause.",
                    "4.2 This Agreement shall automatically renew for successive twelve (12) month periods unless either party provides written notice of non-renewal at least thirty (30) days prior to the expiry of the then-current term.",
                    "4.3 Either party may terminate this Agreement immediately upon written notice if the other party commits a material breach and fails to remedy such breach within thirty (30) days of receiving written notice.",
                ]
            },
        ],
    }))

    files.append(create_contract("nda_techpartner_2024.pdf", {
        "title": "Non-Disclosure Agreement",
        "party_a": "DocProc Inc.",
        "party_b": "TechPartner Ltd.",
        "effective_date": "November 1, 2024",
        "expiry_date": "October 31, 2026",
        "contract_value": None,
        "governing_law": "Republic of Singapore",
        "auto_renewal": None,
        "sections": [
            {
                "heading": "1. CONFIDENTIAL INFORMATION",
                "paragraphs": [
                    "1.1 For the purposes of this Agreement, \"Confidential Information\" means any information disclosed by either party to the other, whether orally, in writing, or by inspection, that is designated as confidential or that reasonably should be understood to be confidential.",
                    "1.2 Confidential Information includes, without limitation: trade secrets, business plans, customer lists, financial information, technical data, source code, algorithms, product roadmaps, and any other proprietary information.",
                    "1.3 Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the receiving party; (b) was known to the receiving party prior to disclosure; (c) is independently developed without use of Confidential Information.",
                ]
            },
            {
                "heading": "2. OBLIGATIONS",
                "paragraphs": [
                    "2.1 Each party agrees to hold the other party's Confidential Information in strict confidence and not to disclose such information to any third party without prior written consent.",
                    "2.2 Each party shall use the Confidential Information solely for the purpose of evaluating and pursuing a potential business relationship between the parties.",
                    "2.3 Each party shall limit access to Confidential Information to those employees and advisors who have a need to know and who are bound by confidentiality obligations no less restrictive than those contained herein.",
                ]
            },
        ],
    }))

    files.append(create_contract("maintenance_contract_2025.pdf", {
        "title": "IT Maintenance Agreement",
        "party_a": "DocProc Inc.",
        "party_b": "TechServe Solutions Pte. Ltd.",
        "effective_date": "January 1, 2025",
        "expiry_date": "December 31, 2025",
        "contract_value": 48000.00,
        "governing_law": "Republic of Indonesia",
        "auto_renewal": "Yes — 60-day notice required to cancel",
        "sections": [
            {
                "heading": "1. SCOPE OF SERVICES",
                "paragraphs": [
                    "1.1 The Service Provider shall provide comprehensive IT maintenance services covering: server infrastructure monitoring, database administration, network management, and security patch deployment.",
                    "1.2 Services shall be delivered remotely with on-site support available within 4 business hours for Priority 1 incidents in the Jakarta metropolitan area.",
                    "1.3 The Service Provider shall maintain a dedicated team of no fewer than 2 engineers familiar with the Client's infrastructure at all times during business hours (08:00 - 18:00 WIB, Monday to Friday).",
                ]
            },
            {
                "heading": "2. SERVICE LEVELS",
                "paragraphs": [
                    "2.1 Priority 1 (Critical): System down or major functionality impacted. Response within 30 minutes, resolution target 4 hours.",
                    "2.2 Priority 2 (High): Significant performance degradation. Response within 2 hours, resolution target 8 hours.",
                    "2.3 Priority 3 (Medium): Minor issues with workaround available. Response within 4 hours, resolution target 24 hours.",
                    "2.4 Priority 4 (Low): Cosmetic issues or enhancement requests. Response within 1 business day, resolution target 5 business days.",
                    "2.5 Monthly uptime guarantee: 99.9%. Service credits apply at 5% of monthly fee per 0.1% below target.",
                ]
            },
            {
                "heading": "3. FEES AND PAYMENT",
                "paragraphs": [
                    "3.1 The annual maintenance fee is $48,000.00 (Forty-Eight Thousand US Dollars), payable monthly at $4,000.00 per month.",
                    "3.2 Invoices shall be issued on the 1st of each month and are due within 14 days.",
                    "3.3 Additional on-site visits beyond the included 12 per year shall be billed at $500.00 per visit.",
                    "3.4 Emergency out-of-hours support shall be billed at 1.5x the standard hourly rate of $150.00.",
                ]
            },
        ],
    }))

    print(f"  Generated {len(files)} documents:\n")
    for f in files:
        size_kb = os.path.getsize(f) / 1024
        print(f"    {os.path.basename(f):45s} {size_kb:6.1f} KB")

    print(f"\n  Output directory: {OUTPUT_DIR}\n")


if __name__ == "__main__":
    main()
