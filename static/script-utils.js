// Utility functions for GTIN parsing, response normalization, and navigation
export function parseGtinInput(raw) {
  if (!raw) return [];
  // split on commas (primary), allow optional surrounding whitespace
  return raw
    .split(',')
    .map(s => String(s || '').trim())
    .filter(Boolean);
}

export function normalizeServerResponse(body, submittedGtin) {
  // Target shape:
  // { response, color, productName, gtin, mainImageUrl, additionalImagesUrls: [] }
  const item = {
    response: null,
    color: null,
    productName: null,
    gtin: submittedGtin || null,
    mainImageUrl: null,
    additionalImagesUrls: [],
  };

  if (!body) {
    item.response = 'no-response';
    return item;
  }

  // Handle server returning { items: [...] } where each item may be an array
  // in the shape: [status, statusCode, productName, color, mainImageUrl, additionalImages[]]
  if (Array.isArray(body.items)) {
    const first = body.items.length ? body.items[0] : null;
    if (!first) {
      item.response = 'no-data';
      return item;
    }
    if (Array.isArray(first)) {
      // Map array positions to item fields
      // [status, statusCode, productName, color, mainImageUrl, swatchUrl, additionalImages[]]
      item.response = first[0] || null;
      item.color = first[3] || null;
      item.productName = first[2] || null;
      item.gtin = submittedGtin || item.gtin;
      item.mainImageUrl = first[4] || null;
      item.swatch = first[5] || null;
      item.additionalImagesUrls = Array.isArray(first[6]) ? first[6] : [];
      return item;
    }
    if (typeof first === 'object') {
      // If server returned objects inside items, map known keys
      item.response = first[0] || first.status || first.result || null;
      item.color = first.color || null;
      item.productName = first.product || first.productName || null;
      item.gtin = submittedGtin || item.gtin;
      item.mainImageUrl = first.main || first.mainImageUrl || (first.images && first.images.main) || null;
      item.swatch = first.swatch || first.swatchImageUrl || null;
      item.additionalImagesUrls = first.additional || first.additionalImagesUrls || (first.images && first.images.additional) || [];
      return item;
    }
  }

  // New compact shape when result == 'same'
  if (body.response || body.main_image_url || body.additionals) {
    item.response = body.response || body.result || null;
    item.color = body.color || null;
    item.productName = body.product || null;
    item.gtin = body.gtin || submittedGtin || item.gtin;
    item.mainImageUrl = body.main_image_url || (body.images && body.images.main) || null;
    item.additionalImagesUrls = body.additionals || (body.images && body.images.additional) || [];
    return item;
  }

  // Older/verbose shape
  item.response = body.result || body.error || null;
  item.color = body.color || null;
  item.productName = body.product || null;
  item.gtin = submittedGtin || item.gtin;
  item.mainImageUrl = (body.images && body.images.main) || null;
  item.additionalImagesUrls = (body.images && body.images.additional) || [];
  return item;
}

export class Navigator {
  constructor(list = []) {
    this.list = Array.isArray(list) ? list.slice() : [];
    this.index = this.list.length ? 0 : -1;
  }

  setList(list) {
    this.list = Array.isArray(list) ? list.slice() : [];
    this.index = this.list.length ? 0 : -1;
  }

  currentIndex() { return this.index; }
  currentItem() { return this.index >= 0 ? this.list[this.index] : null; }

  atStart() { return this.index <= 0; }
  atEnd() { return this.index < 0 ? true : this.index >= this.list.length - 1; }

  prev() {
    if (this.index > 0) this.index -= 1;
    return this.currentItem();
  }

  next() {
    if (this.index < this.list.length - 1) this.index += 1;
    return this.currentItem();
  }

  reset() {
    this.list = [];
    this.index = -1;
  }
}

export default { parseGtinInput, normalizeServerResponse, Navigator };
