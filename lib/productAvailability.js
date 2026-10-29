/** Keep the existing order within each group, without changing the input array.
 * @template T
 * @param {T[]} products
 * @param {(product: T) => boolean} isSoldOut
 * @returns {T[]}
 */
export function availableProductsFirst(products, isSoldOut) {
  const available = [];
  const soldOut = [];
  for (const product of products) {
    (isSoldOut(product) ? soldOut : available).push(product);
  }
  return [...available, ...soldOut];
}
