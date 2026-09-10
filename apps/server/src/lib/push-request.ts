// Retry only transport failures and explicitly temporary HTTP failures.
export async function pushRequest(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if ((response.status !== 429 && response.status < 500) || attempt === 2) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2 || init.signal?.aborted) throw error;
    }
    if (init.signal?.aborted) throw init.signal.reason;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
}
