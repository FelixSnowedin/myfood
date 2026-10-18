import { categoryFromOffTags, type Category } from './categories';

export interface OffResult {
  name: string;
  category: Category;
}

interface OffResponse {
  status?: number;
  product?: { product_name?: string; product_name_de?: string; categories_tags?: string[] };
}

export function parseOffResponse(json: OffResponse | null): OffResult | null {
  if (json?.status !== 1 || !json.product) return null;
  const p = json.product;
  return {
    name: (p.product_name_de || p.product_name || '').trim(),
    category: categoryFromOffTags(p.categories_tags ?? []),
  };
}

// Any failure means "unknown product": the user just types the name.
export async function fetchOffProduct(barcode: string): Promise<OffResult | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,product_name_de,categories_tags`,
    );
    if (!res.ok) return null;
    return parseOffResponse(await res.json());
  } catch {
    return null;
  }
}
