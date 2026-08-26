import { prisma } from "../lib/prisma.js";

export function approximateHomeCoordinate(value: number | null) {
  return value == null ? null : Math.round(value * 1_000) / 1_000;
}

export async function friendIdsAmong(currentUserId: string, userIds: string[]) {
  const candidates = [...new Set(userIds.filter((id) => id !== currentUserId))];
  if (!candidates.length) return new Set<string>();
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userAId: currentUserId, userBId: { in: candidates } },
        { userBId: currentUserId, userAId: { in: candidates } },
      ],
    },
    select: { userAId: true, userBId: true },
  });
  return new Set(friendships.map((friendship) => (
    friendship.userAId === currentUserId ? friendship.userBId : friendship.userAId
  )));
}
