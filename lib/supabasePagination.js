export const SUPABASE_PAGE_SIZE = 1000;

// Supabase commonly caps one response at 1,000 rows. Operational product
// screens use this helper so records never disappear as inventory grows.
export async function fetchAllRows(buildQuery, pageSize = SUPABASE_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const rows = [];
  for (let from = 0; ;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    // A server can impose a smaller cap than requested. Only an empty page
    // proves completion; advance by the number actually received.
    if (page.length === 0) return { data: rows, error: null };
    from += page.length;
  }
}

export async function fetchRowsInChunks(values, buildQuery, chunkSize = 100) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("Invalid chunk size");
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const { data, error } = await buildQuery(values.slice(index, index + chunkSize));
    if (error) return { data: null, error };
    rows.push(...(Array.isArray(data) ? data : []));
  }
  return { data: rows, error: null };
}

// For a complete SELECT (never use with writes, single(), or preview limits).
// The unique column is appended as a tie-breaker to any existing ordering.
// Optional IN values are chunked as well as the returned rows: a small list of
// product IDs can still have thousands of images, variants or sale details.
/**
 * @param {any} query
 * @param {string} [uniqueColumn]
 * @param {{column: string, values: Array<string | number>} | null} [inFilter]
 */
export async function fetchCompleteQuery(query, uniqueColumn = "id", inFilter = null) {
  const load = (builder) => {
    builder = builder.order(uniqueColumn, { ascending: true });
    return fetchAllRows((from, to) => builder.range(from, to));
  };
  if (!inFilter) return load(query);
  if (typeof query !== "function") throw new Error("Chunked queries require a fresh query factory");
  const values = [...new Set(inFilter.values)];
  return fetchRowsInChunks(values, (chunk) => load(query().in(inFilter.column, chunk)));
}
