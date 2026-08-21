export const SUPABASE_PAGE_SIZE = 1000;

// Supabase commonly caps one response at 1,000 rows. Operational product
// screens use this helper so records never disappear as inventory grows.
export async function fetchAllRows(buildQuery, pageSize = SUPABASE_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

export async function fetchRowsInChunks(values, buildQuery, chunkSize = 100) {
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const { data, error } = await buildQuery(values.slice(index, index + chunkSize));
    if (error) return { data: null, error };
    rows.push(...(Array.isArray(data) ? data : []));
  }
  return { data: rows, error: null };
}
