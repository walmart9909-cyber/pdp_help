# PDP Help - Product Data Validation Automation

## Problem Statement

### Business Challenge
Walmart product teams struggle with **manual verification** of product data consistency:
- **Data Inconsistency Issues**: Product/color combinations exist but image URLs are inconsistent across rows
- **Manual Checking**: Employees manually search Excel files to verify product-color pairs and image URLs
- **Time-Consuming**: Process is slow and error-prone with large datasets
- **Quality Control**: No automated way to ensure image consistency (main, additional, swatch images)

### Solution
**PDP Help** is a web-based automation tool that:
✅ Validates product/color combinations in Excel files  
✅ Ensures image URLs are consistent across rows  
✅ Detects missing or duplicate data  
✅ Works with flexible Excel formats (Walmart templates + normal files)  
✅ Provides instant visual feedback with display images  
✅ Handles both display labels and machine labels in headers  

---

## Project Overview

**PDP Help** is a Flask-based web application that validates Walmart product data in Excel files. It automatically:
- Detects column headers (flexible location and naming)
- Validates product/color combinations
- Verifies image URL consistency across rows
- Displays matching images in an organized three-panel layout

---

## Architecture

### System Design

```
┌─────────────────┐
│   USER UPLOADS  │
│  EXCEL FILE +   │
│ SEARCH PARAMS   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   WEB INTERFACE (3-Panel Layout)│
│ ┌─────────┬──────────┬────────┐ │
│ │ FORM    │ MAIN/    │ ADDITIONAL
│ │         │ SWATCH   │ IMAGES  │
│ │         │ IMAGES   │ (2/row) │
│ └─────────┴──────────┴────────┘ │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   FLASK BACKEND (app.py)        │
│ • Temp file handling            │
│ • Excel parsing                 │
│ • Header detection              │
│ • Data validation               │
│ • Image URL extraction          │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   DATA VALIDATION ENGINE        │
│ • Product/Color matching        │
│ • Image consistency checking    │
│ • Error detection & reporting   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   RESPONSE WITH IMAGES          │
│ • Validation status             │
│ • Main image URL                │
│ • Additional images URLs        │
│ • Swatch image URL              │
└─────────────────────────────────┘
```

### Data Flow

1. **User Input** → Uploads Excel file + enters product name, color, optional sheet name
2. **File Upload** → JavaScript (`script.js`) sends FormData to `/check` endpoint
3. **Backend Processing** → Flask (`app.py`):
   - Saves uploaded file to temp folder
   - Detects header row location
   - Validates product/color combination
   - Extracts image URLs
   - Returns JSON with results + image data
4. **UI Display** → Three-panel layout:
   - **Panel 1**: Form with result status
   - **Panel 2**: Main image + Swatch image
   - **Panel 3**: Additional images in 2-column grid

### Core Components

#### 1. Excel Processing (`app.py` - Functions 30-120)

**Header Detection** (`find_header_row_by_labels()`)
- Scans all rows to locate headers (not just row 0)
- Supports both Walmart display labels ("Product Name") and machine labels ("productName")
- Falls back to "mainImageUrl" search if primary headers not found
- Returns the row index where headers are found
- **Use case**: Works with headers at any row position (row 0, 5, 10, etc.)

**Column Normalization** (`normalize_columns()`)
- Strips whitespace from all column names
- Handles varying spacing in Excel exports

**Column Resolution** (`resolve_column_names()`)
- Maps display names and machine names to actual dataframe columns
- Handles suffixed duplicates: "swatchImageUrl.1", "Additional Image URL.2"
- Returns dict: `{"product": col, "color": col, "main": col, "swatch": col}`
- Validates all required columns exist

**Data Row Filtering** (`drop_non_data_rows()`)
- Removes Walmart documentation rows (e.g., "URL, 2500 characters...")
- Removes header duplicate rows
- Removes fully blank rows
- Keeps only actual product data rows

#### 2. Validation Logic (`app.py` - Lines 121-180)

**Core Validation** (`check()` function)
- **Input**: DataFrame, product name, color
- **Process**:
  - Filters rows by product name (case-insensitive)
  - Filters by color (case-insensitive)
  - Validates all image columns for consistency
  - Checks swatch column (optional)
  - Extracts image URLs
- **Output**: Tuple of (result_string, image_data_dict)

**Results (Semantic Status)**:
| Result | Meaning | HTTP Code |
|--------|---------|-----------|
| `"same"` | ✅ Product found, all images consistent | 200 |
| `"product not found"` | ❌ No matching product in sheet | 404 |
| `"color not there"` | ❌ Product exists but not in that color | 404 |
| `"something is wrong"` | ❌ Images are inconsistent across rows | 200 |
| `"swatch is wrong"` | ⚠️ Swatch images inconsistent (others OK) | 200 |

**Validation Philosophy**:
- **All-or-nothing consistency**: If product/color has multiple rows, ALL image columns must be identical
- **Blank is acceptable**: Entirely blank image columns pass (optional images)
- **Mixed blank/non-blank fails**: Rows with some blank and some filled values fail validation
- **Swatch is optional**: Missing or all-blank swatch passes validation

#### 3. API Endpoint (`app.py` - Lines 255-310)

**POST /check**
```
Request: multipart/form-data
├── excelFile: [file] (required)
├── product: string (required)
├── color: string (required)
└── sheetName: string (optional, defaults to "Product Content And Site Exp")

Response: application/json (always HTTP 200 if no exceptions)
{
  "result": "same",
  "semantic_status": 200,
  "images": {
    "main": "https://example.com/image1.jpg",
    "additional": [
      "https://example.com/image2.jpg",
      "https://example.com/image3.jpg"
    ],
    "swatch": "https://example.com/swatch.jpg"
  }
}
```

**Error Handling**:
- `FileNotFoundError` → HTTP 400
- `KeyError` (missing columns) → HTTP 400
- `ValueError` (sheet not found) → HTTP 400
- Unexpected errors → HTTP 500

#### 4. Frontend (`templates/index.html` + `static/script.js`)

**Three-Panel Layout**:
1. **Form Section** (left):
   - File upload input
   - Product name input
   - Color input
   - Sheet name input
   - Validation result status

2. **Main Images Section** (center):
   - Response status message
   - Main image (200px height)
   - Swatch image (200px height)

3. **Additional Images Section** (right):
   - Grid layout with 2 images per row
   - Auto-scrolling overflow
   - Fallback placeholder for failed URLs

**JavaScript Logic** (`script.js`):
- Form submission with FormData (file upload)
- Client-side validation
- Loading state management
- HTML escaping to prevent XSS
- Responsive image display
- Error fallback handling

---

## Key Patterns & Conventions

### Excel Handling
| Feature | Details |
|---------|---------|
| **Default Sheet** | "Product Content And Site Exp" |
| **Header Detection** | Automatic - scans all rows |
| **Column Names** | Both display ("Product Name") and machine ("productName") |
| **Duplicate Columns** | Handles suffixes: "Additional Image URL.1", "swatchImageUrl.2" |
| **Documentation Rows** | Filtered out automatically |

### Validation Rules
| Rule | Behavior |
|------|----------|
| **Product Match** | Case-insensitive, stripped whitespace |
| **Color Match** | Case-insensitive, stripped whitespace |
| **Image Consistency** | All rows for product/color must have identical images |
| **Blank Images** | All-blank column = acceptable (optional) |
| **Mixed Blank** | Some blank + some filled = validation fails |
| **Swatch Image** | Optional - missing or blank swatch doesn't fail |

### File Upload Safety
- Files saved to OS temp folder (`tempfile.gettempdir()`)
- Filenames sanitized with `secure_filename()`
- Temp files deleted after processing
- No persistent storage of uploaded files

---

## Running & Deployment

### Local Setup
```bash
# Install dependencies
pip install -r req.txt

# Run development server
python app.py
```
- Server: `http://localhost:5000`
- Debug mode: Enabled (auto-reload on code changes)

### Production Deployment
```bash
# With Gunicorn (recommended)
gunicorn -w 4 -b 0.0.0.0:5000 app:app

# With Waitress (Windows)
waitress-serve --port=5000 app:app

# With Docker
docker build -t pdp-help .
docker run -p 5000:5000 pdp-help
```

### Configuration
```python
DEFAULT_SHEET = "Product Content And Site Exp"  # Change for different default
app.run(host="0.0.0.0", port=5000, debug=False)  # Set debug=False in production
```

---

## File Structure

```
Pdp Help/
├── app.py                          # Flask backend + validation logic
├── req.txt                         # Dependencies
├── templates/
│   └── index.html                 # Three-panel layout
├── static/
│   ├── script.js                  # File upload + image display logic
│   └── styles.css                 # Glassomorphism UI styling
└── .github/
    └── copilot-instructions.md    # This documentation
```

---

## Testing & Validation

### Test Scenarios

**Scenario 1: Normal Excel (Headers in Row 0)**
```
File: normal_products.xlsx (Sheet1)
Headers: Product Name | Color | Main Image URL | Additional Image URL.1 | ...
Data: Product A | Blue | https://... | https://... | ...
Expected: ✅ "same" with images
```

**Scenario 2: Walmart Template (Headers in Row 5)**
```
File: walmart_template.xlsx (Product Content And Site Exp)
Row 0-4: Documentation
Row 5: Headers (display labels)
Row 6+: Data
Expected: ✅ Auto-detected, "same" with images
```

**Scenario 3: Inconsistent Images**
```
Product: "Shirt"
Color: "Red"
Row 1: Main Image = https://a.jpg
Row 2: Main Image = https://b.jpg  ← Different!
Expected: ❌ "something is wrong"
```

**Scenario 4: Product Not Found**
```
Search: Product = "NonExistent", Color = "Blue"
Expected: ❌ "product not found"
```

**Scenario 5: Color Not Available**
```
Search: Product = "Shirt" (exists), Color = "Purple" (not available)
Expected: ❌ "color not there"
```

### Known Behaviors
- Header detection is flexible - works with headers at any row
- Swatch column is truly optional - validation passes if missing
- Image URLs are not validated for accessibility - just existence
- Empty product/color searches fail gracefully with clear messages

---

## Development Guidelines

### Adding New Validation Rules
1. Modify `check()` function (line ~150)
2. Add new return status string to result map
3. Update frontend `displayImages()` for new status types
4. Add test case to verify behavior

### Supporting New Excel Formats
1. Update `DISPLAY_*` and `MACHINE_*` constants (lines 18-25)
2. Update `resolve_column_names()` logic (lines ~90)
3. Update documentation phrases if needed (lines 26-27)
4. Test with sample file

### Customizing Default Sheet
```python
DEFAULT_SHEET = "Your Custom Sheet Name"  # Line 255
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Could not locate header row" | Headers not found | Check column names match exactly |
| "Sheet 'X' not found" | Wrong sheet name | Verify exact sheet name from Excel tabs |
| Files not uploading | File size too large | Increase Flask upload limit |
| Images not displaying | URLs broken/expired | Check image URL validity in Excel |
| "Product not found" | Typo in search | Check exact product name in Excel |

---

## Deployment Checklist

- [ ] Change `debug=False` in `app.py` (line 344)
- [ ] Update `DEFAULT_SHEET` if needed (line 255)
- [ ] Configure file upload size limits (if needed)
- [ ] Set up error logging
- [ ] Test with production Excel files
- [ ] Configure HTTPS/SSL
- [ ] Set up database logging (optional)
- [ ] Configure CORS if behind proxy
- [ ] Test file upload functionality
- [ ] Verify temp file cleanup works

---

## Version Info
- **Flask**: 2.0+
- **Pandas**: 1.0+
- **openpyxl**: 3.0+
- **Python**: 3.7+

