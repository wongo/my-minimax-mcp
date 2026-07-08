import type { ModelId } from "./types.js";

const REQUEST_TIMEOUT_MS = 60_000;

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
  private readonly defaultModel: ModelId;

  constructor(apiKey: string, baseUrl: string = "https://api.minimax.io", defaultModel: ModelId = "MiniMax-M2.7") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "MM-API-Source": "Minimax-MCP",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        // A bare fetch never gives up; a stalled socket would hang the MCP tool forever.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(`Request to ${path} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw err;
    }

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

  async understandImage(prompt: string, imageDataUrl: string, model?: ModelId): Promise<ImageUnderstandResponse> {
    const body: { prompt: string; image_url: string; model?: ModelId } = {
      prompt,
      image_url: imageDataUrl,
    };
    if (model !== undefined) {
      body.model = model;
    }
    return this.request<ImageUnderstandResponse>("/v1/coding_plan/vlm", body);
  }

  getDefaultModel(): ModelId {
    return this.defaultModel;
  }
}
