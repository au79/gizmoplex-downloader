import { input, password } from '@inquirer/prompts';

export async function readEmail(): Promise<string> {
  const envEmail = environmentValue('GIZMOPLEX_EMAIL') ?? environmentValue('GIZMOPLEX_USERNAME');

  if (envEmail) {
    return envEmail;
  }

  return input({ message: 'Gizmoplex email', required: true });
}
export async function readPassword(): Promise<string> {
  const envPassword = environmentValue('GIZMOPLEX_PASSWORD');

  if (envPassword) {
    return envPassword;
  }

  return password({
    message: 'Gizmoplex password',
    mask: '*',
    validate: (value) => value.length > 0 || 'Password is required',
  });
}

function environmentValue(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return value;
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.at(-1) === quote ? value.slice(1, -1) : value;
}
