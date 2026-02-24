/**
 * Shared typed data structures for the SDK.
 */

export interface APIResponse {
  statusCode: number;
  headers: Record<string, string>;
  text: string;
  data: unknown;
  requestUrl: string;
  requestMethod: string;
  requestId: string | null;
  ok: boolean;
}

export async function fromFetchResponse(response: Response, requestMethod: string): Promise<APIResponse> {
  const text = await response.text();
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    statusCode: response.status,
    headers,
    text,
    data: parseResponseData(text, response.headers.get("content-type") ?? ""),
    requestUrl: response.url,
    requestMethod,
    requestId: response.headers.get("x-request-id") ?? null,
    ok: response.status >= 200 && response.status < 300,
  };
}

function parseResponseData(responseText: string, contentType: string): unknown {
  if (!responseText) return null;

  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    const stripped = responseText.trimStart();
    if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
      return null;
    }
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return null;
  }
}
