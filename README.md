✨ PDP Help — Product Data Validation Automation ✨

╭────────────────────────────────────────────────╮
│  Fast checks for product images across Excel   │
│  — upload a sheet, provide GTIN(s), and review │
│  main · swatch · additional images at-a-glance │
╰────────────────────────────────────────────────╯

Purpose
- Validate product/color image consistency in Excel files (Walmart templates or generic).
- Let users upload an Excel file and submit one or more Sellable GTINs; the backend finds the product and color for each GTIN, verifies image consistency, and returns image URLs for display.

Key features
- Automatic header detection (supports headers at any row).
- Maps both display labels (e.g., "Product Name") and machine labels (e.g., "productName").
- Validates main/additional/swatch image columns for consistency across rows.
- Accepts one or more GTINs (comma or whitespace separated) and returns per-GTIN results.
- Frontend displays a 3-panel UI: form, metadata+swatch, main image + additional images grid.

Project layout
- app.py                 — Flask backend + Excel processing and validation logic
- req.txt                — Python dependencies
- templates/index.html   — Frontend form + panels
- static/script.js       — Frontend logic (submits form, navigation, rendering)
- static/script-utils.js — Client normalization and Navigator utility
- static/styles.css      — Styles for the three-panel UI

API: POST /check
- Request: multipart/form-data
  - `excelFile` (file) — required: the uploaded Excel file
  - `gtin` (string)    — required: one or more Sellable GTINs (comma or whitespace separated)
  - `sheetName` (string) — optional: sheet/tab name (defaults to "Product Content And Site Exp")

- Response: JSON { "items": [ ... ] }
  Each entry in `items` is an array in this exact shape:
    [status, statusCode, productName, color, mainImageUrl, swatchUrl, additionalImages[]]
  Where:
    - `status` is a string like `same`, `something_is_wrong`, `swatch is wrong`, `GTIN_NF`, `PRODUCT_NF`, `COLOR_NF`, `ERROR`, etc.
    - `statusCode` is an integer (200/404/500 semantics as set by backend mapping)
    - `productName` and `color` are strings when available (may be null)
    - `mainImageUrl` and `swatchUrl` are strings or null
    - `additionalImages` is an array of strings (may be empty)

Error responses
- If the request is malformed or file/sheet/columns are missing, the endpoint returns JSON { "error": "..." } with an HTTP status (400 or 500).

Backend behavior (high-level)
- Saves the uploaded file temporarily and uses pandas/openpyxl to read the sheet.
- Detects header row by scanning rows for known labels (display or machine names).
- Resolves product/color/main/swacht/gtin column names (including suffixed variants like `swatchImageUrl.1`).
- Finds rows that match a GTIN, extracts product name and color, and runs a `check` that validates image column consistency.
- On success (`same`), returns collected image URLs (main, swatch, additional).

Frontend behavior
- `templates/index.html` contains a form to upload the file and enter GTIN(s).
- `static/script.js` parses whitespace/comma-separated GTINs and uses a Navigator to Prev/Next through GTIN results.
- When server returns an error (non-OK HTTP), the frontend shows an alert with the server message and sets the result panel to an error state.
- `static/script-utils.js` normalizes server responses, including the current `items` array-of-arrays shape, mapping the swatch URL into `item.swatch`.

Notes and recent changes
- The response `items` array now includes `swatchUrl` at position 5. The client normalization was updated to map this into `item.swatch` so the swatch renders in Panel 2 when present.
- The frontend displays images in Panel 2 only when the status indicates success (e.g., `same`).
- The client now alerts users for non-OK HTTP responses and shows `result` messages in the UI.

Running locally
1. Create a Python environment and install dependencies:

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r req.txt
```

2. Run the Flask server:

```bash
python app.py
```

3. Open http://localhost:5000 in a browser, upload an Excel file, and enter one or more Sellable GTINs (e.g., `1234567890123 2345678901234`).

Quick test checklist
- Verify header detection for both Walmart templates and simple sheets.
- Include swatch image column in the Excel to validate swatch is returned and rendered.
- Try a GTIN that does not exist → expect `GTIN_NF` in `items`.
- Try a GTIN whose product exists but color is missing → expect `COLOR_NF`.

If you want
- I can add a small example Excel and automated tests.
- I can add inline API docs in `app.py` and comment the main functions.

Contact
- If anything in the API shape changes, update `static/script-utils.js` and `templates/index.html` to keep the client and server in sync.
