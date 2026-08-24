// Contract §6 voting policy (pure functions, unit-testable without Prisma).
// - Strict majority of ACCEPTED participants confirms immediately.
// - Tie-break order: most votes -> better recommendationRank (lower number) -> stable id.

export interface VoteTally {
  placeCandidateId: string;
  votes: number;
  recommendationRank: number | null;
}

export function hasMajority(votes: number, acceptedParticipants: number): boolean {
  return acceptedParticipants > 0 && votes * 2 > acceptedParticipants;
}

export function allParticipantsVoted(voteCount: number, acceptedParticipants: number): boolean {
  return acceptedParticipants > 0 && voteCount >= acceptedParticipants;
}

/** Deterministic winner; null when there are no candidates at all. */
export function pickWinner(tallies: VoteTally[]): VoteTally | null {
  if (tallies.length === 0) return null;
  const sorted = [...tallies].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    const rankA = a.recommendationRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.recommendationRank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.placeCandidateId.localeCompare(b.placeCandidateId);
  });
  return sorted[0] ?? null;
}
