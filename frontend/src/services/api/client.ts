import { env } from "@/config/env";
import type { ApiError } from "@/types/api.types";

/**
 * Generic REST API client wrapper around native fetch.
 * Handles base URL, default headers, and JSON serialization.
 * Does NOT contain any domain-specific endpoints.
 */

/**
 * Pull a human-readable reason out of an error body.
 * FastAPI answers with `{ detail: "..." }` for HTTPException and
 * `{ detail: [{ loc, msg, ... }] }` for request validation, while other services use
 * `{ message: "..." }`. Reading only `message` meant every rejected action surfaced
 * as the opaque "An error occurred".
 */
function extractErrorMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return null;

  const body = payload as { detail?: unknown; message?: unknown };
  const detail = body.detail ?? body.message;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as { loc?: unknown[]; msg?: unknown };
        const field = Array.isArray(entry.loc) ? entry.loc.slice(1).join(".") : "";
        const msg = typeof entry.msg === "string" ? entry.msg : null;
        if (!msg) return null;
        return field ? `${field}: ${msg}` : msg;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length) return parts.join("; ");
  }

  return null;
}

class ApiClient {
  private baseURL = env.API_BASE_URL;

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers = new Headers(options.headers);
    if (!headers.has("Content-Type") && options.method !== "GET" && options.method !== "DELETE") {
      headers.set("Content-Type", "application/json");
    }

    if (env.IS_DEV_PREVIEW && options.method !== "GET") {
      console.warn(`[DEV PREVIEW] Blocked HTTP mutation to ${endpoint}`);
      const error: ApiError = {
        status: 403,
        message: "Preview mode — backend control disabled"
      };
      throw error;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      
      if (!response.ok) {
        let errorMessage = `Request failed (HTTP ${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = extractErrorMessage(errorData) ?? errorMessage;
        } catch {
          // Response is not JSON
        }
        const error: ApiError = {
          status: response.status,
          message: errorMessage
        };
        throw error;
      }

      // Handle empty responses
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json() as T;
    } catch (err) {
      if ((err as ApiError).status) {
        throw err;
      }
      const genericError: ApiError = {
        status: 0,
        message: err instanceof Error ? err.message : "Network error"
      };
      throw genericError;
    }
  }

  public get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  public post<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public put<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  public delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
