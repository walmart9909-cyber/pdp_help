# PDP Help - Product Data Validation Automation

## Problem Statement

### Business Challenge
Walmart product teams struggle with **manual verification** of product data consistency:
- **Data Inconsistency Issues**: Product/color combinations exist but image URLs are inconsistent across rows
- **Manual Checking**: Employees manually search Excel files to verify product-color pairs and image URLs
- **Time-Consuming**: Process is slow and error-prone with large datasets
- **Quality Control**: No automated way to ensure image consistency (main, additional, swatch images)

````instructions
# PDP Help - Product Data Validation Automation (Developer Notes)

Purpose
- Validate product/color image consistency in Excel files and surface images for review.

Quick summary of the current implementation (canonical):
- The UI accepts an uploaded Excel file and a list of one or more Sellable GTINs (comma or whitespace separated).
- The backend (`app.py`) scans the uploaded sheet, resolves columns (product, color, main, swatch, additional, gtin), and returns per-GTIN results.
- Responses are returned as `{"items": [...]}` where each item is an array:

   [status, statusCode, productName, color, mainImageUrl, swatchUrl, additionalImages[]]

   - `status`: string like `same`, `GTIN_NF`, `PRODUCT_NF`, `COLOR_NF`, `something is wrong`, `swatch is wrong`, `ERROR`.
   - `statusCode`: numeric HTTP-like code chosen by the server (200 / 404 / 500, etc.).

Frontend
- `templates/index.html` contains a multi-panel UI: Form (upload + GTINs + sheetName), Metadata+Swatch panel, Main image + Additional images panel.
- `static/script.js` handles form submission and navigation through GTINs using a `Navigator` abstraction. It displays only the selected GTIN's result in Panel 2.
- On non-OK server responses the client alerts the returned error message and shows the result box as an error.

Client normalization
- `static/script-utils.js` provides `normalizeServerResponse(body, submittedGtin)` which maps the backend `items` shape into the client-friendly object:

   { response, productName, color, gtin, mainImageUrl, swatch, additionalImagesUrls }

- The normalizer handles both array-shaped items and object-shaped items in `body.items`.

Backend behavior (high level)
- Accepts multipart `excelFile`, `gtin` (string), optional `sheetName`.
- Saves the uploaded file to a temp folder and uses pandas/openpyxl to read and detect header rows.
- `resolve_column_names()` maps display and machine labels and handles suffixed duplicates.
- For each GTIN: find matching rows, extract product & color, run `check_excel()` which validates image columns.
- On success (`same`) returns collected `main`, `swatch`, and `additional` URLs.

API contract (current)
- POST `/check`
   - Request: `multipart/form-data` with `excelFile` (file), `gtin` (string; one or more GTINs separated by whitespace or commas), `sheetName` (optional)
   - Response: `200` with JSON: `{ "items": [ [status, code, product, color, main, swatch, additional[]], ... ] }` or a non-OK error containing `{ "error": "..." }`.

Developer notes / gotchas
- The client currently expects the server to preserve input order of GTINs in `items` and maps only the first returned item when a single-GTIN request is made. If you change the server shape, update `static/script-utils.js` accordingly.
- Swatch handling: swatch is optional; it will be included at index 5 of the item array when present and mapped into `item.swatch`.
- The header detection scans all rows; if headers are unusual, update `DISPLAY_*` and `MACHINE_*` constants.
- Temporary uploaded files are deleted in the `finally` block — be careful when debugging (temp file may be removed before you inspect it).

Testing / local run
1. Install dependencies: `pip install -r req.txt`
2. Run: `python app.py`
3. Open `http://localhost:5000`, upload an Excel file and enter GTIN(s) like `1234567890123 2345678901234` then submit.

If something in the project is out-of-sync with the current code (for example: response shape, field names, or UI expectations), update the appropriate files and the README. The canonical single-source-of-truth for current behavior is `app.py` (server) and `static/script-utils.js` (client normalization).

EOF
````
┌─────────────────────────────────┐

│   FLASK BACKEND (app.py)        │
