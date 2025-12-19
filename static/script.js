
import { parseGtinInput, normalizeServerResponse, Navigator } from './script-utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('product-form');
  if (!form) return;

  // Controls for GTIN list cycling
  const gtinCounter = document.getElementById('gtin-counter') || document.getElementById('response-counter');
  const prevRespBtn = document.getElementById('prev-btn-response');
  const nextRespBtn = document.getElementById('next-btn-response');
  const resetRespBtn = document.getElementById('reset-btn-response');
  const responseCounter = document.getElementById('response-counter');

  let gtinList = [];
  const navigator = new Navigator([]);
  const results = []; // normalized response items per index (null until fetched)

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const fileInput = document.getElementById('excelFile');
    const gtinRaw = document.getElementById('gtin').value.trim();
    // parse space-separated GTINs (trim, remove empties)
    gtinList = gtinRaw.split(/\s+/).map(s => s.trim()).filter(Boolean);
    navigator.setList(gtinList);
    // reset results store and counters
    results.length = 0;
    for (let i = 0; i < gtinList.length; i++) results.push(null);
    updateCounter();
    updateControls();
    const gtin = navigator.currentItem();
    // remember the currently-submitted GTIN so UI shows the selected one (not the full input list)
    document.body.dataset.currentGtin = gtin || '';

    if (!fileInput.files.length) {
      alert('Please select an Excel file.');
      return;
    }

    if (!gtin) {
      alert('Please enter at least one Sellable GTIN.');
      return;
    }

    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);
    formData.append('gtin', gtin);
 
    const sheetName = document.getElementById('sheetName').value.trim();
    if (sheetName) {
      formData.append('sheetName', sheetName);
    }

    const resultBox = document.getElementById('result');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    try {
      // show loading state
      resultBox.classList.remove('result-success', 'result-error', 'result-warning');
      resultBox.classList.add('loading');
      submitBtn.disabled = true;

      const res = await fetch('/check', {
        method: 'POST',
        body: formData
      });

      const contentType = res.headers.get('content-type') || '';
      let payload = null;
      if (contentType.includes('application/json')) payload = await res.json();
      else payload = { error: await res.text() };

      if (!res.ok) {
        const msg = payload && payload.error ? payload.error : `HTTP ${res.status}`;
        alert(msg);
        resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">${escapeHtml(msg)}</span>`;
        resultBox.classList.add('result-error');
        hideAllImages();
      } else {
        // Normalize server payload into consistent item shape
        const item = normalizeServerResponse(payload, gtin);
        // store in results at current index
        const idx = navigator.currentIndex();
        if (idx >= 0) results[idx] = item;

        // show success or graceful message
        if (item.response && String(item.response).toLowerCase() === 'same') {
          resultBox.innerHTML = `<span class="result-icon">✅</span><span class="result-text">${escapeHtml(item.response)}</span>`;
          resultBox.classList.add('result-success');
          displaySelectedItem(item);
        } else {
          const msg = item.response || 'no data';
          resultBox.innerHTML = `<span class="result-icon">⚠️</span><span class="result-text">${escapeHtml(String(msg))}</span>`;
          resultBox.classList.add('result-warning');
          displaySelectedItem(item);
        }
      }
    } catch (err) {
      resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">Request failed: ${escapeHtml(err.message)}</span>`;
      resultBox.classList.add('result-error');
      hideAllImages();
    } finally {
      // clear loading state
      resultBox.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });

  // Navigation and reset are handled by the form's response buttons
  // updateControls will synchronize those controls via updateResponseControls()

  // Response-panel Prev/Next/Reset wiring
  if (prevRespBtn) {
    prevRespBtn.addEventListener('click', () => {
      navigator.prev();
      updateCounter();
      updateResponseControls();
      const item = results[navigator.currentIndex()];
      if (item) displaySelectedItem(item);
      else submitForCurrentGtin();
    });
  }

  if (nextRespBtn) {
    nextRespBtn.addEventListener('click', () => {
      navigator.next();
      updateCounter();
      updateResponseControls();
      const item = results[navigator.currentIndex()];
      if (item) displaySelectedItem(item);
      else submitForCurrentGtin();
    });
  }

  if (resetRespBtn) {
    resetRespBtn.addEventListener('click', () => {
      navigator.reset();
      results.length = 0;
      document.getElementById('gtin').value = '';
      updateCounter();
      updateControls();
      updateResponseControls();
      hideAllImages();
      delete document.body.dataset.currentGtin;
      const resultBox = document.getElementById('result');
      resultBox.innerHTML = `<span class="result-text" style="opacity:.9">Awaiting input — submit the form to run the check.</span>`;
      resultBox.classList.remove('result-success','result-error','result-warning');
    });
  }

  function updateCounter() {
    if (!gtinCounter) return;
    const total = (navigator.list && navigator.list.length) ? navigator.list.length : 0;
    const pos = navigator.currentIndex() >= 0 ? (navigator.currentIndex() + 1) : 0;
    gtinCounter.textContent = `${pos}/${total}`;
  }

  function updateControls() {
    // Keep response controls synchronized with navigator state
    updateResponseControls();
  }

  function updateResponseControls() {
    if (prevRespBtn) prevRespBtn.disabled = navigator.atStart();
    if (nextRespBtn) nextRespBtn.disabled = navigator.atEnd();
    if (responseCounter) responseCounter.textContent = `${navigator.currentIndex() >= 0 ? navigator.currentIndex() + 1 : 0}/${navigator.list.length}`;
  }

  async function submitForCurrentGtin() {
    const fileInput = document.getElementById('excelFile');
    const sheetName = document.getElementById('sheetName').value.trim();
    const resultBox = document.getElementById('result');
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!fileInput.files.length) {
      alert('Please select an Excel file.');
      return;
    }
    if (!navigator.list.length || navigator.currentIndex() < 0) return;

    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);
    formData.append('gtin', navigator.currentItem());
    if (sheetName) formData.append('sheetName', sheetName);
    // ensure UI shows the GTIN we're about to request
    document.body.dataset.currentGtin = navigator.currentItem() || '';

    try {
      resultBox.classList.remove('result-success', 'result-error', 'result-warning');
      resultBox.classList.add('loading');
      submitBtn.disabled = true;

      const res = await fetch('/check', { method: 'POST', body: formData });
      const contentType = res.headers.get('content-type') || '';
      let payload = null;
      if (contentType.includes('application/json')) payload = await res.json();
      else payload = { error: await res.text() };

      if (!res.ok) {
        const msg = payload && payload.error ? payload.error : `HTTP ${res.status}`;
        alert(msg);
        resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">${escapeHtml(msg)}</span>`;
        resultBox.classList.add('result-error');
        hideAllImages();
      } else {
        const submittedGtin = navigator.currentItem();
        const item = normalizeServerResponse(payload, submittedGtin);
        const idx = navigator.currentIndex();
        if (idx >= 0) results[idx] = item;

        if (item.response && String(item.response).toLowerCase() === 'same') {
          resultBox.innerHTML = `<span class="result-icon">✅</span><span class="result-text">${escapeHtml(item.response)}</span>`;
          resultBox.classList.add('result-success');
          displaySelectedItem(item);
        } else {
          const msg = item.response || 'no data';
          resultBox.innerHTML = `<span class="result-icon">⚠️</span><span class="result-text">${escapeHtml(String(msg))}</span>`;
          resultBox.classList.add('result-warning');
          displaySelectedItem(item);
        }
      }
    } catch (err) {
      resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">Request failed: ${escapeHtml(err.message)}</span>`;
      resultBox.classList.add('result-error');
      hideAllImages();
    } finally {
      resultBox.classList.remove('loading');
      submitBtn.disabled = false;
    }
  }

  // initialize response control state
  updateResponseControls();
});

function displaySelectedItem(item) {
  // item shape: { response, color, productName, gtin, mainImageUrl, additionalImagesUrls: [] }
  const responseMeta = document.getElementById('response-meta');
  const responseGtin = document.getElementById('response-gtin');
  const responseProduct = document.getElementById('response-product');
  const responseColor = document.getElementById('response-color');
  const swatchPanel = document.getElementById('swatch-panel');
  const responseSwatchImg = document.getElementById('response-swatch-img');
  const fullMainImage = document.getElementById('full-main-image');
  const additionalGrid = document.getElementById('additional-images-grid');

  responseMeta.style.display = 'block';
  responseGtin.textContent = item.gtin || document.body.dataset.currentGtin || '';
  responseProduct.textContent = item.productName || '';
  responseColor.textContent = item.color || '';

  // swatch is optional and may be inside item.swatch
  if (item.swatch) {
    responseSwatchImg.src = item.swatch;
    responseSwatchImg.onerror = () => { responseSwatchImg.src = ''; };
    swatchPanel.style.display = 'block';
  } else {
    swatchPanel.style.display = 'none';
  }

  // main image
  if (item.mainImageUrl) {
    fullMainImage.src = item.mainImageUrl;
    fullMainImage.onerror = () => { fullMainImage.src = ''; };
  } else {
    fullMainImage.src = '';
  }

  // additional images
  additionalGrid.innerHTML = '';
  if (item.additionalImagesUrls && item.additionalImagesUrls.length) {
    item.additionalImagesUrls.forEach((url, i) => {
      const el = document.createElement('div');
      el.className = 'image-item';
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Additional ${i+1}`;
      img.onerror = () => { img.src = ''; };
      el.appendChild(img);
      additionalGrid.appendChild(el);
    });
  }
}

function hideAllImages() {
  // hide response panels
  const responseMeta = document.getElementById('response-meta');
  const swatchPanel = document.getElementById('swatch-panel');
  const fullMainImage = document.getElementById('full-main-image');
  const additionalGrid = document.getElementById('additional-images-grid');
  responseMeta.style.display = 'none';
  swatchPanel.style.display = 'none';
  fullMainImage.src = '';
  additionalGrid.innerHTML = '';
}

// small utility to avoid inserting raw HTML from server
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
