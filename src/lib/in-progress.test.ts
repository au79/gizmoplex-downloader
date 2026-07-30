import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deleteInProgressPlan, createResumeController, inProgressPath, offerInProgressPlan, readInProgressPlan, saveInProgressPlan, saveInProgressPlanSync, serializeInProgressPlan } from './in-progress.js';

describe('serializeInProgressPlan', () => {
  it('writes a versioned plan payload', () => expect(JSON.parse(serializeInProgressPlan([]))).toMatchObject({ version: 1, planned: [] }));

  it('reads, writes, validates, and deletes saved plans', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'gizmo-plan-'));
    const planPath = inProgressPath(root);
    try {
      await expect(readInProgressPlan(planPath)).resolves.toBeUndefined();
      expect(inProgressPath(root, './custom-plan')).toBe(path.resolve('./custom-plan'));
      await saveInProgressPlan(planPath, []);
      saveInProgressPlanSync(planPath, []);
      await saveInProgressPlan(planPath, [{ downloads: [], transactionDescription: 'Product', videoTitle: 'Video', videoUrl: 'https://video' }]);
      await expect(readInProgressPlan(planPath)).resolves.toMatchObject({ version: 1, planned: [{ videoTitle: 'Video' }] });
      await deleteInProgressPlan(planPath);
      await expect(readInProgressPlan(planPath)).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects unsupported versions and exposes resumable active state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'gizmo-plan-'));
    const planPath = path.join(root, '.in-progress');
    try {
      await (await import('node:fs/promises')).writeFile(planPath, '{"version":2,"planned":[]}', 'utf8');
      await expect(readInProgressPlan(planPath)).rejects.toThrow('Unsupported');
      const controller = createResumeController();
      controller.setActive({ path: planPath, planned: [{ downloads: [], transactionDescription: 'Product', videoTitle: 'Video', videoUrl: 'https://video' }] });
      controller.saveSync();
      await controller.save();
      expect(JSON.parse(await readFile(planPath, 'utf8'))).toMatchObject({ version: 1 });
      saveInProgressPlanSync(planPath, [{ downloads: [], transactionDescription: 'Product', videoTitle: 'Video', videoUrl: 'https://video' }]);
      const download = vi.fn().mockResolvedValue(undefined);
      await expect(offerInProgressPlan({}, { dryRun: false, out: root }, vi.fn(), download, async () => true)).resolves.toBe(true);
      expect(download).toHaveBeenCalled();
      await expect(offerInProgressPlan({}, { dryRun: true, out: root }, vi.fn(), download, async () => true)).resolves.toBe(false);
      controller.clear();
      controller.saveSync();
      await controller.save();
      await expect(offerInProgressPlan({}, { dryRun: false, out: root }, vi.fn(), download, async () => false)).resolves.toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
