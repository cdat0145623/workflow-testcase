import type { LocatorCandidate } from "@cwa-dev/sendkit-workflow-contract";

const strategyRank: Record<LocatorCandidate["locator"]["strategy"], number> = {
  test_id: 0,
  role: 1,
  label: 2,
  name: 3,
  css: 4,
  xpath: 5,
};

export function rankLocatorCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.verified !== right.verified) return left.verified ? -1 : 1;
    if (left.matchCount !== right.matchCount) return left.matchCount === 1 ? -1 : right.matchCount === 1 ? 1 : left.matchCount - right.matchCount;
    return strategyRank[left.locator.strategy] - strategyRank[right.locator.strategy];
  });
}

export function selectVerifiedLocator(candidates: LocatorCandidate[] | undefined) {
  return rankLocatorCandidates(candidates ?? []).find((candidate) => candidate.verified && candidate.matchCount === 1)?.locator;
}
