export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

export interface WebSearchResponse {
  organic: WebSearchResult[];
  related_searches: Array<{ query: string }>;
}

export interface ImageUnderstandResponse {
  content: string;
}

interface BaseResponse {
  base_resp?: {
    status_code: number;
    status_msg?: string;
  };
}

export class CodingPlanClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = "https://api.minimax.io") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "MM-API-Source": "Minimax-MCP",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = new Error(`HTTP error ${response.status}`);
      (error as Error & { status: number }).status = response.status;
      throw error;
    }

    const data = (await response.json()) as BaseResponse & T;

    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error(data.base_resp.status_msg ?? "Unknown API error");
    }

    return data as T;
  }

  async webSearch(query: string): Promise<WebSearchResponse> {
    return this.request<WebSearchResponse>("/v1/coding_plan/search", { q: query });
  }

  async understandImage(prompt: string, imageDataUrl: string): Promise<ImageUnderstandResponse> {
    return this.request<ImageUnderstandResponse>("/v1/coding_plan/vlm", {
      prompt,
      image_url: imageDataUrl,
    });
  }
}
