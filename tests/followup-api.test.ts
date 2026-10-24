// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecapPerson } from '../lib/graph-writes';

const mocks = vi.hoisted(() => ({
  getEventSummary: vi.fn(),
  getRecapPeopleForIntent: vi.fn(),
  saveFollowUp: vi.fn(),
  jsonCompletion: vi.fn(),
}));
vi.mock('../lib/graph-writes', () => mocks);
vi.mock('../lib/openai', () => ({ jsonCompletion: mocks.jsonCompletion }));
import { POST } from '../app/api/recap/followups/route';

function person(id: number): RecapPerson {
  return {
    name: `Contact ${id}`, linkedinUrl: `https://linkedin.com/in/contact-${id}`,
    headline: '', company: 'Company', noteText: '', contextBullets: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEventSummary.mockResolvedValue({ primaryIntent: 'networking' });
  mocks.saveFollowUp.mockResolvedValue(undefined);
  mocks.jsonCompletion.mockResolvedValue({ message: 'Generated message' });
});

describe('follow-up generation API', () => {
  it('generates once per contact, even when the graph returns repeated rows', async () => {
    mocks.getRecapPeopleForIntent.mockResolvedValue([person(1), person(1), person(2)]);
    const response = await POST();
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.drafts.map((draft: { personUrl: string }) => draft.personUrl))
      .toEqual([person(1).linkedinUrl, person(2).linkedinUrl]);
    expect(mocks.jsonCompletion).toHaveBeenCalledTimes(2);
    expect(mocks.saveFollowUp).toHaveBeenCalledTimes(2);
  });

  it('applies the five-person limit after removing duplicate and missing identities', async () => {
    mocks.getRecapPeopleForIntent.mockResolvedValue([
      { ...person(0), linkedinUrl: '' }, person(1), person(1),
      person(2), person(3), person(4), person(5), person(6),
    ]);
    const body = await (await POST()).json();
    expect(body.drafts.map((draft: { personUrl: string }) => draft.personUrl))
      .toEqual([1, 2, 3, 4, 5].map(id => person(id).linkedinUrl));
    expect(mocks.saveFollowUp).toHaveBeenCalledTimes(5);
  });
});
