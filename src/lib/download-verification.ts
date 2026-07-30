export function isVerifiedDownload(existingSize: number | undefined, expectedSizeBytes: number | undefined): boolean {
  return existingSize !== undefined && (expectedSizeBytes === undefined || existingSize === expectedSizeBytes);
}

export function assertDownloadedSize(resourceDescription: string, expectedSizeBytes: number | undefined, actualSizeBytes: number): void {
  if (expectedSizeBytes !== undefined && actualSizeBytes !== expectedSizeBytes) {
    throw new Error(`Download size mismatch for ${resourceDescription}: expected ${expectedSizeBytes} bytes, received ${actualSizeBytes} bytes.`);
  }
}
