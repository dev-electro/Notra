export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 502,
    readonly code: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}
