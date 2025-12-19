import { parseGtinInput, normalizeServerResponse, Navigator } from '../script-utils.js';

describe('parseGtinInput', () => {
  test('single GTIN', () => {
    expect(parseGtinInput('12345')).toEqual(['12345']);
  });

  test('multiple space-separated GTINs with extra spaces', () => {
    expect(parseGtinInput(' 123  456 789 ')).toEqual(['123','456','789']);
  });

  test('empty input returns empty array', () => {
    expect(parseGtinInput('')).toEqual([]);
  });
});

describe('normalizeServerResponse', () => {
  test('compact same response', () => {
    const body = {
      response: 'same',
      main_image_url: 'https://a.jpg',
      additionals: ['https://b.jpg'],
      color: 'Blue',
      product: 'Shirt',
      gtin: '111'
    };
    const out = normalizeServerResponse(body, '111');
    expect(out.response).toBe('same');
    expect(out.mainImageUrl).toBe('https://a.jpg');
    expect(out.additionalImagesUrls).toEqual(['https://b.jpg']);
    expect(out.color).toBe('Blue');
    expect(out.productName).toBe('Shirt');
  });

  test('verbose error response', () => {
    const body = { result: 'product not found', error: 'not found', images: {} };
    const out = normalizeServerResponse(body, '222');
    expect(out.response).toBe('product not found');
    expect(out.gtin).toBe('222');
  });
});

describe('Navigator', () => {
  test('navigation boundaries and reset', () => {
    const nav = new Navigator(['a','b','c']);
    expect(nav.currentIndex()).toBe(0);
    expect(nav.atStart()).toBe(true);
    expect(nav.atEnd()).toBe(false);
    nav.next();
    expect(nav.currentIndex()).toBe(1);
    nav.next();
    expect(nav.atEnd()).toBe(true);
    nav.next();
    expect(nav.currentIndex()).toBe(2);
    nav.prev();
    expect(nav.currentIndex()).toBe(1);
    nav.reset();
    expect(nav.currentIndex()).toBe(-1);
  });
});
