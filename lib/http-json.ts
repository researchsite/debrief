/** Account for framework and proxy failures returning HTML or an empty body. */
export async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  let data;
  try { data = JSON.parse(await response.text()); }
  catch { throw new Error(`${fallback}. Please retry. (${response.status})`); }
  if (!response.ok || !data || typeof data !== 'object' || data.ok === false) {
    throw new Error((typeof data?.error === 'string' && data.error) ? data.error : `${fallback}. Please retry.`);
  }
  return data as T;
}
