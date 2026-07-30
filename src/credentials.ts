import { input, password } from '@inquirer/prompts';

export async function readEmail(): Promise<string> {
  const envEmail = process.env.GIZMOPLEX_EMAIL ?? process.env.GIZMOPLEX_USERNAME;

  if (envEmail) {
    return envEmail;
  }

  return input({ message: 'Gizmoplex email', required: true });
}
export async function readPassword(): Promise<string> {
  const envPassword = process.env.GIZMOPLEX_PASSWORD;

  if (envPassword) {
    return envPassword;
  }

  return password({
    message: 'Gizmoplex password',
    mask: '*',
    validate: (value) => value.length > 0 || 'Password is required',
  });
}
