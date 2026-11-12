import type { Weather } from "./weather";

export interface MoodRecord {
  date: string;
  weather: Weather;
  note: string;
  created_at: string;
  updated_at: string;
}
export interface Backup {
  version: number;
  records: MoodRecord[];
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error("暂时连不上气象台，请检查服务是否启动，再试一次。");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ??
        (response.status === 413
          ? "备份文件太大，请选择 5 MB 以内的文件。"
          : "这次没有成功，请稍后再试。"),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
