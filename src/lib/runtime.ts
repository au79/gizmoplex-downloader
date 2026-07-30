export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

export function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError' || /\b5\d\d\b/.test(error.message);
}

export function formatRetryDelay(milliseconds: number): string {
  return `${Math.round(milliseconds / 1000)}s`;
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
