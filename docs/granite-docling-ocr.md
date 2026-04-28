# Granite-Docling Multimodal OCR (Lab)

Experimental OCR engine using **IBM granite-docling-258M** via the
[`docling`](https://github.com/DS4SD/docling) Python SDK. Lives in the
**OCR Lab** page (`/ocr-lab`) — completely separate from the production
Tesseract / Mistral OCR pipeline.

## Why a separate engine

`granite-docling-258M` is a 258M-parameter vision-language model
purpose-built for document understanding. Unlike traditional OCR which
gives you a flat string of text, it returns a structured
`DoclingDocument` with:

| Element        | Detected? | Notes |
|----------------|:---------:|-------|
| Body text      | ✅ | Multilingual, layout preserved |
| Headings       | ✅ | Section labels & levels |
| Tables         | ✅ | Cell-by-cell structure, exportable to dataframe |
| Embedded images| ✅ | Bounding box + thumbnail |
| Form fields    | ✅ | Key/value pairs, handwriting flag |
| Signatures     | ✅ | Bounding box + confidence |
| Code / formulas| ✅ | Preserved as separate elements |

This is overkill for plain invoices, but the right tool for forms with
handwritten fields, multi-table reports, scanned contracts with
signatures, and image-heavy compliance documents.

## Why not replace Tesseract / Mistral yet

- Model download is ~520 MB
- Cold-start adds noticeable latency
- Heavy deps (`torch`, `transformers`) — about 2–3 GB on disk
- Quality vs. cost vs. latency trade-off must be measured against the
  document mix in production

The Lab lets us evaluate on real documents before promoting it to the
default OCR engine.

## Install (backend host)

```bash
cd backend
pip install -r requirements-granite.txt
```

The first request will download `ibm-granite/granite-docling-258M` from
HuggingFace (~520 MB). Subsequent requests reuse the cached model.

If running in Docker, add this step to the production backend Dockerfile
or build a separate `backend.granite.Dockerfile` so non-granite
deployments stay slim.

## How to test

1. Open the app, sign in, and click **OCR Lab** in the sidebar (Beta tag).
2. The page shows whether the engine is installed. If not, you'll see an
   inline notification with the install command.
3. Upload a document (PDF / PNG / JPG / TIFF / WebP).
4. Click **Run granite-docling**.
5. Inspect the result tabs:
   - **Markdown** — full text with preserved layout
   - **Tables** — extracted as HTML tables
   - **Images** — thumbnails of embedded images
   - **Form fields** — labels + values, with handwriting flag
   - **Signatures** — bounding boxes + confidence
   - **Headings** — section list

## What to test

The Lab home page lists suggested document types. Good candidates:

- **Privacy policy** (`demo-data/pdp-demo/*.txt`) — baseline text + headings
- **Filled application form** with handwritten signature — exercises
  form fields + handwriting + signatures
- **Bank statement** — exercises table extraction
- **Insurance claim** with photos — exercises image extraction
- **Scanned contract** — exercises signature detection on multi-page docs

## API reference

All endpoints require auth.

### `GET /api/v1/ocr-lab/status`

Returns:
```json
{
  "available": true,
  "model": "ibm-granite/granite-docling-258M",
  "engine": "granite-docling",
  "install_hint": "pip install -r backend/requirements-granite.txt",
  "docling_version": "2.x.x"
}
```

If `available: false`, the install command above is the fix.

### `POST /api/v1/ocr-lab/process`

Multipart form with a single `file` field. Returns the structured
`GraniteDoclingResult` payload — see `backend/app/services/granite_docling_engine.py`
for the schema. **Does NOT persist anything** to the database.

### `GET /api/v1/ocr-lab/samples`

Returns the suggested-document list shown on the Lab page.

## Files

| Path | Purpose |
|------|---------|
| `backend/requirements-granite.txt` | Optional pip deps |
| `backend/app/services/granite_docling_engine.py` | Engine wrapper + result types |
| `backend/app/api/v1/endpoints/ocr_lab.py` | API endpoints (under `/api/v1/ocr-lab/*`) |
| `frontend/src/pages/OCRLabPage.tsx` | Lab UI |
| `docs/granite-docling-ocr.md` | This file |

## Promoting to production

When the engine is ready to replace Tesseract:

1. Add `granite_docling` as an option in `backend/app/services/ocr.py`
   so it integrates with the main `OCRPipeline`.
2. Update `OCR_PROVIDER` in `.env.example` to include the new value.
3. Move the dependency from `requirements-granite.txt` into the main
   `requirements.txt` (or build a separate Docker image).
4. Add it to the `OCR Provider` radio group in the Settings page.
5. Deprecate / remove the Lab UI once the engine is the default.
