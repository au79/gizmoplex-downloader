#!/usr/bin/env node

import 'dotenv/config';
import { parseOptions } from './cli.js';
import { runApplication } from './lib/coordinator.js';
import { errorMessage } from './lib/runtime.js';

try {
  await runApplication(parseOptions());
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
