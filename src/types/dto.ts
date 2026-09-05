export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}
