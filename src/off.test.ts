import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOffProduct, parseOffResponse } from './off';

describe('parseOffResponse', () => {
  it('prefers the German name', () => {
    const json = { status: 1, product: { product_name: 'Milk', product_name_de: 'Vollmilch ', categories_tags: ['en:milks'] } };
    expect(parseOffResponse(json)).toEqual({ name: 'Vollmilch', category: 'Milchprodukte' });
  });
  it('skips a blank German name', () => {
    expect(parseOffResponse({ status: 1, product: { product_name_de: ' ', product_name: 'Milk' } })).toEqual({ name: 'Milk', category: 'Sonstiges' });
  });
  it('falls back to the generic name and Sonstiges', () => {
    expect(parseOffResponse({ status: 1, product: { product_name: 'Thing' } })).toEqual({ name: 'Thing', category: 'Sonstiges' });
  });
  it('returns null when not found', () => {
    expect(parseOffResponse({ status: 0 })).toBeNull();
    expect(parseOffResponse(null)).toBeNull();
  });
});

describe('fetchOffProduct', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchOffProduct('4000000000000')).toBeNull();
  });
  it('returns null on HTTP 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    expect(await fetchOffProduct('4000000000000')).toBeNull();
  });
  it('parses a found product', async () => {
    const body = JSON.stringify({ status: 1, product: { product_name_de: 'Butter', categories_tags: ['en:dairies'] } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    expect(await fetchOffProduct('4000000000000')).toEqual({ name: 'Butter', category: 'Milchprodukte' });
  });
});
