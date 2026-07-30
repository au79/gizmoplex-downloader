import { writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { errorMessage, isNodeError } from './runtime.js';
import type { InProgressPlan, PlannedVideoDownload } from '../types.js';


export function inProgressPath(outputRoot: string, specifiedPath?: string): string { return specifiedPath ? path.resolve(specifiedPath) : path.join(outputRoot, '.in-progress'); }
export async function readInProgressPlan(planPath: string): Promise<InProgressPlan | undefined> {
  try { const parsed = JSON.parse(await readFile(planPath, 'utf8')) as InProgressPlan; if (parsed.version !== 1 || !Array.isArray(parsed.planned)) throw new Error('Unsupported .in-progress file format.'); return parsed; }
  catch (error) { if (isNodeError(error) && error.code === 'ENOENT') return undefined; throw new Error(`Could not read .in-progress: ${errorMessage(error)}`); }
}
export async function saveInProgressPlan(planPath: string, planned: PlannedVideoDownload[]): Promise<void> { if (!planned.length) return; await mkdir(path.dirname(planPath), { recursive: true }); await writeFile(planPath, serializeInProgressPlan(planned), 'utf8'); console.error(`\nSaved current download plan to ${planPath}`); }
export function saveInProgressPlanSync(planPath: string, planned: PlannedVideoDownload[]): void { if (!planned.length) return; writeFileSync(planPath, serializeInProgressPlan(planned), 'utf8'); console.error(`\nSaved current download plan to ${planPath}`); }
export async function deleteInProgressPlan(planPath: string): Promise<void> { await rm(planPath, { force: true }); }
export function serializeInProgressPlan(planned: PlannedVideoDownload[]): string { return `${JSON.stringify({ planned, savedAt: new Date().toISOString(), version: 1 } satisfies InProgressPlan, null, 2)}\n`; }

export function createResumeController(): {
  setActive(active: { path: string; planned: PlannedVideoDownload[] } | undefined): void;
  saveSync(): void;
  save(): Promise<void>;
  clear(): void;
} {
  let active: { path: string; planned: PlannedVideoDownload[] } | undefined;
  return {
    setActive(value) { active = value; },
    saveSync() { if (active) saveInProgressPlanSync(active.path, active.planned); },
    async save() { if (active) await saveInProgressPlan(active.path, active.planned); },
    clear() { active = undefined; },
  };
}

export async function offerInProgressPlan<TClient, TDelay>(
  client: TClient,
  options: { dryRun: boolean; out: string; inProgressPlan?: string; delay?: TDelay },
  printSummary: (planned: PlannedVideoDownload[]) => void,
  download: (client: TClient, planned: PlannedVideoDownload[], planPath: string, delay: TDelay | undefined, deleteOnSuccess: boolean) => Promise<void>,
  confirmUse: (count: number) => Promise<boolean>,
): Promise<boolean> {
  if (options.dryRun) return false;
  const planPath = inProgressPath(path.resolve(options.out), options.inProgressPlan);
  const plan = await readInProgressPlan(planPath);
  if (!plan || !await confirmUse(plan.planned.length)) return false;
  printSummary(plan.planned);
  await download(client, plan.planned, planPath, options.delay, true);
  return true;
}
