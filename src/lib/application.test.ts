import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  controller: { saveSync: vi.fn(), setActive: vi.fn() },
  clear: vi.fn().mockResolvedValue(undefined),
  processInteractive: vi.fn().mockResolvedValue(undefined),
  offer: vi.fn().mockResolvedValue(false),
}));

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn().mockResolvedValue(true) }));
vi.mock('../credentials.js', () => ({ readEmail: vi.fn().mockResolvedValue('rev@example.test'), readPassword: vi.fn().mockResolvedValue('secret') }));
vi.mock('./http-client.js', () => ({ login: vi.fn().mockResolvedValue({}) }));
vi.mock('./transactions.js', () => ({ fetchTransactions: vi.fn().mockResolvedValue([]) }));
vi.mock('./metadata-cache.js', () => ({ MetadataCache: class { clear = mocks.clear; } }));
vi.mock('./video-discovery.js', () => ({ extractPageTitleCandidates: vi.fn() }));
vi.mock('./interactive-workflow.js', () => ({ processInteractiveArchive: mocks.processInteractive }));
vi.mock('./in-progress.js', () => ({ createResumeController: vi.fn(() => mocks.controller), offerInProgressPlan: mocks.offer, inProgressPath: vi.fn(), readInProgressPlan: vi.fn(), deleteInProgressPlan: vi.fn(), saveInProgressPlan: vi.fn(), saveInProgressPlanSync: vi.fn() }));

import { runApplication } from './coordinator.js';

describe('application orchestration', () => {
  it('constructs dependencies, clears cache, and selects interactive mode', async () => {
    mocks.processInteractive.mockImplementationOnce(async (...args: any[]) => { await args[4]([], '/tmp/gizmo-app/.in-progress', undefined); });
    await runApplication({ out: '/tmp/gizmo-app', dryRun: false, clearCache: true, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any);
    expect(mocks.clear).toHaveBeenCalled();
    expect(mocks.processInteractive).toHaveBeenCalled();
  });

  it('returns early when a saved plan is resumed', async () => {
    mocks.offer.mockResolvedValueOnce(true);
    await runApplication({ out: '/tmp/gizmo-app', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any);
    expect(mocks.offer).toHaveBeenCalled();
  });

  it('runs the non-interactive transaction path when no saved plan is used', async () => {
    mocks.offer.mockResolvedValueOnce(false);
    await runApplication({ out: '/tmp/gizmo-app', dryRun: true, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any);
  });

  it('renders and resumes a saved plan through injected persistence', async () => {
    mocks.offer.mockImplementationOnce(async (_client, _options, printSummary, download, confirmUse) => {
      printSummary([]);
      await confirmUse(0);
      await download({}, [], '/tmp/gizmo-app/.in-progress', undefined, true);
      return true;
    });
    await runApplication({ out: '/tmp/gizmo-app', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any);
  });
});
