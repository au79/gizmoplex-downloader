export type DelayRange = {
  max: number;
  min: number;
};

export function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }

  return parsed;
}

export function parseOptionalDelayRange(value: string | undefined, dryRun: boolean): DelayRange | undefined {
  if (value === undefined) {
    return dryRun ? { max: 10, min: 1 } : undefined;
  }

  if (value === '') {
    return undefined;
  }

  const match = value.match(/^([1-9]\d*)-([1-9]\d*)$/);

  if (!match) {
    throw new Error(`Expected delay range as positive-int-positive-int, got ${value}`);
  }

  const min = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);

  if (min > max) {
    throw new Error(`Expected delay range min to be <= max, got ${value}`);
  }

  return { max, min };
}
