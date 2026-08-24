import { describe, it, expect } from "vitest";
import { hasMajority, allParticipantsVoted, pickWinner } from "./vote-policy.js";

describe("vote-policy", () => {
  it("hasMajority", () => {
    expect(hasMajority(3, 6)).toBe(false);
    expect(hasMajority(4, 6)).toBe(true);
    expect(hasMajority(0, 0)).toBe(false);
  });
  it("allParticipantsVoted", () => {
    expect(allParticipantsVoted(5, 5)).toBe(true);
    expect(allParticipantsVoted(4, 5)).toBe(false);
  });
  it("pickWinner by votes", () => {
    const tallies = [
      { placeCandidateId: "b", votes: 2, recommendationRank: 2 },
      { placeCandidateId: "a", votes: 3, recommendationRank: 5 },
    ];
    expect(pickWinner(tallies)?.placeCandidateId).toBe("a");
  });
  it("pickWinner tie by rank", () => {
    const tallies = [
      { placeCandidateId: "a", votes: 2, recommendationRank: 2 },
      { placeCandidateId: "b", votes: 2, recommendationRank: 1 },
    ];
    expect(pickWinner(tallies)?.placeCandidateId).toBe("b");
  });
  it("pickWinner null rank loses", () => {
    const tallies = [
      { placeCandidateId: "a", votes: 2, recommendationRank: null },
      { placeCandidateId: "b", votes: 2, recommendationRank: 1 },
    ];
    expect(pickWinner(tallies)?.placeCandidateId).toBe("b");
  });
  it("pickWinner empty", () => {
    expect(pickWinner([])).toBeNull();
  });
  it("pickWinner id tie-break", () => {
    const tallies = [
      { placeCandidateId: "b", votes: 1, recommendationRank: 1 },
      { placeCandidateId: "a", votes: 1, recommendationRank: 1 },
    ];
    expect(pickWinner(tallies)?.placeCandidateId).toBe("a");
  });
});
