import { afterEach, describe, expect, it } from 'vitest';
import { readEmail, readPassword } from './credentials.ts';

const originalEmail = process.env.GIZMOPLEX_EMAIL;
const originalUsername = process.env.GIZMOPLEX_USERNAME;
const originalPassword = process.env.GIZMOPLEX_PASSWORD;

afterEach(() => {
  restore('GIZMOPLEX_EMAIL', originalEmail);
  restore('GIZMOPLEX_USERNAME', originalUsername);
  restore('GIZMOPLEX_PASSWORD', originalPassword);
});
function restore(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('credentials', () => {
  it('uses environment credentials without prompting', async () => {
    process.env.GIZMOPLEX_EMAIL = 'rev@example.test';
    process.env.GIZMOPLEX_USERNAME = '';
    process.env.GIZMOPLEX_PASSWORD = 'secret';

    await expect(readEmail()).resolves.toBe('rev@example.test');
    await expect(readPassword()).resolves.toBe('secret');
  });

  it('uses the username fallback', async () => {
    delete process.env.GIZMOPLEX_EMAIL;
    process.env.GIZMOPLEX_USERNAME = 'rev';

    await expect(readEmail()).resolves.toBe('rev');
  });
});
