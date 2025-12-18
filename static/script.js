
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('product-form');
  if (!form) return;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const fileInput = document.getElementById('excelFile');
    const product = document.getElementById('productName').value.trim();
    const color = document.getElementById('color').value.trim();
    
    if (!fileInput.files.length || !product || !color) {
      alert('Please select a file, and enter Product Name and Color.');
      return;
    }

    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);
    formData.append('product', product);
    formData.append('color', color);
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
            displayImages(payload.images || {});
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

function displayImages(imageData) {
  const mainSwatchContainer = document.getElementById('main-swatch-container');
  const additionalContainer = document.getElementById('additional-container');
  const mainImageSection = document.getElementById('main-image-section');
  const additionalImagesSection = document.getElementById('additional-images-section');
  const swatchImageSection = document.getElementById('swatch-image-section');
  
  // Reset sections
  mainImageSection.style.display = 'none';
  additionalImagesSection.style.display = 'none';
  swatchImageSection.style.display = 'none';
  mainSwatchContainer.style.display = 'none';
  additionalContainer.style.display = 'none';
  
  // Display main image
  if (imageData.main) {
    const mainImg = document.getElementById('main-image');
    mainImg.src = imageData.main;
    mainImg.onerror = function() {
      this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3EImage not found%3C/text%3E%3C/svg%3E';
    };
    mainImageSection.style.display = 'block';
    mainSwatchContainer.style.display = 'block';
  }
  
  // Display swatch image
  if (imageData.swatch) {
    const swatchImg = document.getElementById('swatch-image');
    swatchImg.src = imageData.swatch;
    swatchImg.onerror = function() {
      this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="150"%3E%3Crect fill="%23f0f0f0" width="150" height="150"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3EImage not found%3C/text%3E%3C/svg%3E';
    };
    swatchImageSection.style.display = 'block';
    mainSwatchContainer.style.display = 'block';
  }
  
  // Display additional images
  if (imageData.additional && imageData.additional.length > 0) {
    const grid = document.getElementById('additional-images-grid');
    grid.innerHTML = '';
    imageData.additional.forEach((imgUrl, index) => {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'image-item';
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = `Additional Image ${index + 1}`;
      img.onerror = function() {
        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="150"%3E%3Crect fill="%23f0f0f0" width="150" height="150"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3EImage not found%3C/text%3E%3C/svg%3E';
      };
      imgContainer.appendChild(img);
      grid.appendChild(imgContainer);
    });
    additionalImagesSection.style.display = 'block';
    additionalContainer.style.display = 'block';
  }
}

function hideAllImages() {
  const mainSwatchContainer = document.getElementById('main-swatch-container');
  const additionalContainer = document.getElementById('additional-container');
  mainSwatchContainer.style.display = 'none';
  additionalContainer.style.display = 'none';
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
