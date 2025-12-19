
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('product-form');
  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const fileInput = document.getElementById('excelFile');
    const gtin = document.getElementById('gtin').value.trim();

    if (!fileInput.files.length) {
      alert('Please select an Excel file.');
      return;
    }

    if (!gtin) {
      alert('Please enter Sellable GTIN.');
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
      if (contentType.includes('application/json')) {
        payload = await res.json();
      } else {
        payload = { error: await res.text() };
      }

      if (!res.ok) {
        const msg = payload && payload.error ? payload.error : `HTTP ${res.status}`;
        resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">${escapeHtml(msg)}</span>`;
        resultBox.classList.add('result-error');
        hideAllImages();
      } else {
        // Handle specific response values with different colors/icons
        if (payload && payload.result) {
          const r = String(payload.result).trim();
          if (r === 'same') {
            resultBox.innerHTML = `<span class="result-icon">✅</span><span class="result-text">${escapeHtml(r)}</span>`;
            resultBox.classList.add('result-success');
            displayImages(payload);
          } else if (r === 'swatch is wrong') {
            resultBox.innerHTML = `<span class="result-icon">⚠️</span><span class="result-text">${escapeHtml(r)}</span>`;
            resultBox.classList.add('result-warning');
            hideAllImages();
          } else {
            resultBox.innerHTML = `<span class="result-icon">❌</span><span class="result-text">${escapeHtml(r)}</span>`;
            resultBox.classList.add('result-error');
            hideAllImages();
          }
        } else {
          const msg = JSON.stringify(payload);
          resultBox.innerHTML = `<span class="result-icon">✅</span><span class="result-text">${escapeHtml(msg)}</span>`;
          resultBox.classList.add('result-success');
          hideAllImages();
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
});

function displayImages(payload) {
  // payload contains at least: images, product, color, maybe gtin
  const images = payload.images || {};
  const responseMeta = document.getElementById('response-meta');
  const responseGtin = document.getElementById('response-gtin');
  const responseProduct = document.getElementById('response-product');
  const responseColor = document.getElementById('response-color');
  const swatchPanel = document.getElementById('swatch-panel');
  const responseSwatchImg = document.getElementById('response-swatch-img');
  const fullMainImage = document.getElementById('full-main-image');
  const additionalGrid = document.getElementById('additional-images-grid');

  // show meta
  responseMeta.style.display = 'block';
  responseGtin.textContent = payload.gtin || document.getElementById('gtin').value || '';
  responseProduct.textContent = payload.product || '';
  responseColor.textContent = payload.color || '';

  // swatch
  if (images.swatch) {
    responseSwatchImg.src = images.swatch;
    responseSwatchImg.onerror = () => { responseSwatchImg.src = ''; };
    swatchPanel.style.display = 'block';
  } else {
    swatchPanel.style.display = 'none';
  }

  // full main
  if (images.main) {
    fullMainImage.src = images.main;
    fullMainImage.onerror = () => { fullMainImage.src = ''; };
  } else {
    fullMainImage.src = '';
  }

  // additional images grid
  additionalGrid.innerHTML = '';
  if (images.additional && images.additional.length) {
    images.additional.forEach((url, i) => {
      const item = document.createElement('div');
      item.className = 'image-item';
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Additional ${i+1}`;
      img.onerror = () => { img.src = ''; };
      item.appendChild(img);
      additionalGrid.appendChild(item);
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
