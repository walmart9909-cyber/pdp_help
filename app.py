
from flask import jsonify, request, Flask, render_template
from pathlib import Path
import argparse
import sys
from werkzeug.utils import secure_filename
import tempfile
import os

# === Excel validation helpers (in this same file) ===
import warnings
import pandas as pd
from typing import Optional, List, Dict

# Silence specific openpyxl warnings (optional)
warnings.filterwarnings(
    "ignore",
    message="Workbook contains no default style, apply openpyxl's default",
    category=UserWarning,
    module="openpyxl.styles.stylesheet",
)
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

# Column display/machine labels
DISPLAY_PRODUCT_NAME = "Product Name"
DISPLAY_COLOR = "Color"
DISPLAY_MAIN_IMAGE = "Main Image URL"
DISPLAY_SWATCH = "Swatch Image URL"
DISPLAY_GTIN = "Sellable GTIN"

MACHINE_PRODUCT_NAME = "productName"
MACHINE_COLOR = "color"
MACHINE_MAIN_IMAGE = "mainImageUrl"
MACHINE_SWATCH = "swatchImageUrl"
MACHINE_GTIN = "sellableGtin"

# Documentation phrases seen in Walmart templates (to filter non-data rows)
DOC_PHRASES_IMAGE = "URL, 2500 characters - Main image of the item"
DOC_PHRASES_COLOR = "Alphanumeric, 600 characters - Color refers"

def normalize(val) -> Optional[str]:
    """Strip and normalize a cell value to None or non-empty string."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None

def find_header_row_by_labels(path: Path, sheet_name: str, must_include: set) -> int:
    """
    Scan the sheet to locate the header row containing required labels.
    If not found, fallback to row containing machine label 'mainImageUrl'.
    """
    tmp = pd.read_excel(path, sheet_name=sheet_name, header=None, engine="openpyxl")
    tmp = tmp.astype(str).apply(lambda col: col.str.strip())

    for idx in range(len(tmp)):
        row_values = set(tmp.iloc[idx].tolist())
        if must_include.issubset(row_values):
            return idx

    # Fallback: look for machine label presence
    for idx in range(len(tmp)):
        row_values = set(tmp.iloc[idx].tolist())
        if MACHINE_MAIN_IMAGE in row_values:
            return idx

    raise ValueError(
        f"Could not locate header row containing {must_include} or '{MACHINE_MAIN_IMAGE}'."
    )

def load_with_detected_header(path: Path, sheet_name: str) -> pd.DataFrame:
    """Load the sheet using the detected header row."""
    header_row = find_header_row_by_labels(path, sheet_name, {DISPLAY_MAIN_IMAGE})
    return pd.read_excel(path, sheet_name=sheet_name, header=header_row, engine="openpyxl")

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Trim column names."""
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df

def resolve_column_names(df: pd.DataFrame) -> Dict[str, Optional[str]]:
    """
    Resolve display/machine column names from the dataframe.
    Returns a dict with keys: product, color, main, swatch (swatch is optional).
    """
    cols = set(df.columns)

    def pick(display_lbl: str, machine_lbl: str) -> Optional[str]:
        if display_lbl in cols:
            return display_lbl
        if machine_lbl in cols:
            return machine_lbl
        for c in df.columns:
            c_str = str(c)
            if c_str.startswith(machine_lbl):  # handles suffixed like 'swatchImageUrl.1'
                return c_str
        return None

    col_product = pick(DISPLAY_PRODUCT_NAME, MACHINE_PRODUCT_NAME)
    col_color   = pick(DISPLAY_COLOR, MACHINE_COLOR)
    col_main    = pick(DISPLAY_MAIN_IMAGE, MACHINE_MAIN_IMAGE)
    col_swatch  = pick(DISPLAY_SWATCH, MACHINE_SWATCH)  # optional
    col_gtin    = pick(DISPLAY_GTIN, MACHINE_GTIN)    # optional

    missing = [
        name for name, val in [
            ("Product Name", col_product),
            ("Color", col_color),
            ("Main Image URL", col_main),
        ] if val is None
    ]
    if missing:
        raise KeyError(
            f"Required column(s) missing: {missing}. Available columns: {list(df.columns)}"
        )

    return {
        "product": col_product,
        "color": col_color,
        "main": col_main,
        "swatch": col_swatch,
        "gtin": col_gtin,
    }

def drop_non_data_rows(df: pd.DataFrame, color_col: str, image_col: str) -> pd.DataFrame:
    """
    Drop rows that look like headers, documentation rows, or fully-blank rows.
    This cleans templates that include guidance text in the data area.
    """
    s_color = df[color_col].astype(str).str.strip()
    s_image = df[image_col].astype(str).str.strip()

    mask_is_header_like = (
        s_color.isin([DISPLAY_COLOR, MACHINE_COLOR]) |
        s_image.isin([DISPLAY_MAIN_IMAGE, MACHINE_MAIN_IMAGE])
    )
    mask_is_doc_row = (
        s_image.str.startswith(DOC_PHRASES_IMAGE) |
        s_color.str.startswith(DOC_PHRASES_COLOR)
    )
    mask_is_blank_row = (s_color.eq("") & s_image.eq(""))

    return df[~(mask_is_header_like | mask_is_doc_row | mask_is_blank_row)].copy()

def get_additional_columns(df: pd.DataFrame) -> List[str]:
    """Return any 'Additional Image URL' / 'productSecondaryImageURL*' column names."""
    cols: List[str] = []
    for c in df.columns:
        c_str = str(c)
        if c_str.startswith("Additional Image URL"):       # display headers
            cols.append(c_str)
        elif c_str.startswith("productSecondaryImageURL"): # machine headers (incl. suffixed)
            cols.append(c_str)
    return cols

def column_valid(series: pd.Series) -> bool:
    """
    Column is valid if:
      - all values are blank (acceptable), OR
      - all non-blank values are present on every row and identical.
    Mixed blank/non-blank or non-identical values are invalid.
    """
    vals = [normalize(v) for v in series.tolist()]
    non_empty = [v for v in vals if v is not None]
    if len(non_empty) == 0:
        return True
    if len(non_empty) != len(vals):
        return False
    return len(set(non_empty)) == 1

def check(df: pd.DataFrame, product_name: str, color: str) -> tuple:
    """
    Core validation for a given product/color:
      - Find product row(s) and color row(s).
      - Verify main + additional image columns are consistent.
      - Optionally verify swatch column if present.
    Returns a tuple of (result_string, image_data_dict):
      result: "same" | "product not found" | "color not there" | "something is wrong" | "swatch is wrong"
      image_data: dict with keys "main", "additional" (list), "swatch" (optional)
    """
    cols = resolve_column_names(df)
    df = drop_non_data_rows(df, cols["color"], cols["main"])

    df_prod = df[df[cols["product"]].astype(str).str.strip() == product_name.strip()]
    if df_prod.empty:
        return "product not found", {}

    df_pc = df_prod[df_prod[cols["color"]].astype(str).str.strip() == color.strip()]
    if df_pc.empty:
        return "color not there", {}

    cols_to_check = [cols["main"]] + get_additional_columns(df)
    for col in cols_to_check:
        if col in df_pc.columns:
            if not column_valid(df_pc[col]):
                return "something is wrong", {}

    if cols["swatch"] and cols["swatch"] in df_pc.columns:
        if not column_valid(df_pc[cols["swatch"]]):
            return "swatch is wrong", {}

    # Collect image data on success
    image_data = {}
    
    # Main image - get first non-empty value
    if cols["main"] in df_pc.columns:
        main_vals = [normalize(v) for v in df_pc[cols["main"]].tolist()]
        main_val = next((v for v in main_vals if v), None)
        if main_val:
            image_data["main"] = main_val
    
    # Additional images
    additional_cols = get_additional_columns(df_pc)
    additional_images = []
    for col in additional_cols:
        if col in df_pc.columns:
            add_vals = [normalize(v) for v in df_pc[col].tolist()]
            add_val = next((v for v in add_vals if v), None)
            if add_val:
                additional_images.append(add_val)
    if additional_images:
        image_data["additional"] = additional_images
    
    # Swatch image - optional
    if cols["swatch"] and cols["swatch"] in df_pc.columns:
        swatch_vals = [normalize(v) for v in df_pc[cols["swatch"]].tolist()]
        swatch_val = next((v for v in swatch_vals if v), None)
        if swatch_val:
            image_data["swatch"] = swatch_val

    return "same", image_data

def check_excel(file_path, sheet_name, product_name, color) -> tuple:
    """
    Run the Excel validation against an Excel file and return the result string and image data.
    `file_path` may be a str or Path.

    Returns: (result_string, image_data_dict)

    Raises:
      - FileNotFoundError if the path doesn't exist
      - ValueError if the sheet is missing or header detection fails
      - KeyError if required columns are missing
    """
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"Excel file not found: {p}")

    # Verify sheet exists (clear message if not)
    try:
        xl = pd.ExcelFile(p, engine="openpyxl")
        if sheet_name not in xl.sheet_names:
            raise ValueError(f"Sheet '{sheet_name}' not found in {p}")
    except Exception:
        # If listing sheets fails, continue; load_with_detected_header will raise appropriately
        pass

    df = load_with_detected_header(p, sheet_name)
    df = normalize_columns(df)
    return check(df, product_name, color)
# === End helpers ===

# === Flask app & route ===
app = Flask(__name__)
DEFAULT_SHEET = "Product Content And Site Exp"  # adjust if needed

# Configure temp folder for uploads
TEMP_FOLDER = tempfile.gettempdir()

@app.route('/check', methods=['POST'])
def validation():
    # Check if request contains file
    if 'excelFile' not in request.files:
        return jsonify({"error": "No file provided. Please upload an Excel file."}), 400
    
    file = request.files['excelFile']
    if file.filename == '':
        return jsonify({"error": "No file selected. Please choose an Excel file."}), 400
    

    gtin         = (request.form.get('gtin') or "").strip()
    sheet_name   = (request.form.get('sheetName') or DEFAULT_SHEET).strip()

    # Require GTIN only (form only sends GTIN now)
    if not gtin:
        return jsonify({"error": "Sellable GTIN is required."}), 400

    # Save uploaded file to temp folder
    try:
        filename = secure_filename(file.filename)
        temp_path = os.path.join(TEMP_FOLDER, filename)
        file.save(temp_path)

        # Load sheet and detect headers so we can lookup by GTIN if provided
        df = load_with_detected_header(temp_path, sheet_name)
        df = normalize_columns(df)

        # Lookup corresponding product and color by GTIN
        cols = resolve_column_names(df)
        if not cols.get("gtin"):
            return jsonify({"error": "GTIN column not found in sheet."}), 400
        mask = df[cols["gtin"]].astype(str).str.strip() == gtin
        matches = df[mask]
        if matches.empty:
            return jsonify({"error": "GTIN not found in sheet."}), 404
        # take first match
        first = matches.iloc[0]
        product_name = normalize(first[cols["product"]])
        color = normalize(first[cols["color"]])

        print(f"GTIN: {gtin}")
        print(f"Product: {product_name}")
        print(f"Color: {color}")

        if not product_name:
            return jsonify({"error": "Product name not found in sheet."}), 404
        
        if not color:
            return jsonify({"error": "Color not found in sheet."}), 404

        # Run validation using loaded dataframe and resolved product/color
        result, image_data = check_excel(temp_path, sheet_name, product_name, color)

        # Map semantic outcomes to HTTP statuses (kept for informational purposes)
        status_map = {
            "same": 200,
            "product not found": 404,
            "color not there": 404,
            "swatch is wrong": 200,
            "something is wrong": 200,
        }
        semantic_status = status_map.get(result, 200)

        # Always return HTTP 200 when processing succeeded (no exceptions).
        # Provide the semantic status inside the JSON so clients can still
        # distinguish success vs. validation outcomes.
        body = {"result": result, "semantic_status": semantic_status, "images": image_data}
        # include resolved product and color in response when available
        if product_name:
            body["product"] = product_name
        if color:
            body["color"] = color
        if semantic_status != 200:
            # Keep an `error` field for UI convenience when result indicates
            # a validation problem (previous behavior expected an `error`).
            body["error"] = result

        return jsonify(body), 200
    
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 400

    except KeyError as e:
        # Missing required columns
        return jsonify({"error": f"Column error: {e}"}), 400

    except ValueError as e:
        # Header detection or sheet not found
        return jsonify({"error": f"Header/sheet error: {e}"}), 400

    except Exception as e:
        # Generic error message for unexpected issues
        return jsonify({"error": "Unexpected error while validating the file. Please check inputs and try again."}), 500
    
    finally:
        # Clean up temp file
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except:
            pass


@app.route('/', methods=['GET'])
def index():
    # Render the form template. JS will POST JSON to `/check`.
    return render_template(
        'index.html',
        default_sheet=DEFAULT_SHEET,
        last_path=None,
        last_product=None,
        last_color=None,
        last_result=None,
    )

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run PDP Help server or utility actions")
    parser.add_argument("--print-for-gtin", action="store_true", help="Print main and additional image URLs for a GTIN and exit")
    parser.add_argument("--file", required=False, help="Path to Excel file for print action")
    parser.add_argument("--gtin", required=False, help="GTIN to lookup for print action")
    parser.add_argument("--sheet", required=False, default=None, help="Sheet name (optional)")
    parser.add_argument("--product", required=False, help="Optional product name to override lookup")
    parser.add_argument("--color", required=False, help="Optional color to override lookup")
    args, rest = parser.parse_known_args()

    if args.print_for_gtin:
        # Validate required args
        if not args.file or not args.gtin:
            print("--file and --gtin are required for --print-for-gtin", file=sys.stderr)
            sys.exit(2)

        def print_images_for_gtin(file_path, gtin, sheet_name=None, product=None, color=None):
            p = Path(file_path)
            if not p.exists():
                print(f"File not found: {p}", file=sys.stderr)
                return 3

            # load sheet
            try:
                sheet_to_use = sheet_name if sheet_name else DEFAULT_SHEET
                df = load_with_detected_header(p, sheet_to_use)
                df = normalize_columns(df)
                cols = resolve_column_names(df)
            except Exception as e:
                print(f"Error loading/reading sheet: {e}", file=sys.stderr)
                return 4

            # Lookup by GTIN if product/color not provided
            if not product or not color:
                if not cols.get("gtin"):
                    print("GTIN column not found in sheet", file=sys.stderr)
                    return 5
                mask = df[cols["gtin"]].astype(str).str.strip() == str(gtin).strip()
                matches = df[mask]
                if matches.empty:
                    print("GTIN not found in sheet", file=sys.stderr)
                    return 6
                first = matches.iloc[0]
                if not product:
                    product = normalize(first[cols["product"]])
                if not color:
                    color = normalize(first[cols["color"]])

            if not product or not color:
                print("Product or color could not be determined.", file=sys.stderr)
                return 7

            # Run check to collect images
            result, image_data = check(df, product, color)

            # ALSO print resolved product and color so we can verify lookup
            print(f"Resolved product: {product}")
            print(f"Resolved color: {color}")

            # Print all main image URLs for the product+color (not only first)
            try:
                df_prod = df[df[cols["product"]].astype(str).str.strip() == product.strip()]
                df_pc = df_prod[df_prod[cols["color"]].astype(str).str.strip() == color.strip()]
                main_list = [normalize(v) for v in df_pc[cols["main"]].tolist()] if cols.get("main") in df_pc.columns else []
                main_list = [m for m in main_list if m]
                if main_list:
                    print("Main images:")
                    for m in main_list:
                        print(m)
                else:
                    print("No main images found for this product/color.")
            except Exception:
                # Fallback to whatever check() returned
                main = image_data.get("main")
                if main:
                    print(main)

            # Then additional images (as before)
            for u in image_data.get("additional", []):
                print(u)

            return 0

        rc = print_images_for_gtin(args.file, args.gtin, sheet_name=args.sheet, product=args.product, color=args.color)
        sys.exit(rc)

    # Otherwise run the Flask app normally
    app.run(host="0.0.0.0", port=5000, debug=True)
