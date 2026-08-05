import 'dotenv/config';
import { parseOptions } from '../src/cli.js';
import { runApplication } from '../src/lib/coordinator.js';
import { errorMessage } from '../src/lib/runtime.js';

async function main() {
  try {
    await runApplication(parseOptions());
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}

void main();
