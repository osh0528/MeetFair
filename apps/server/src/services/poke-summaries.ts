import { prisma } from "../lib/prisma.js";
import { createNotification } from "../lib/notifications.js";
import { lastEndedQuietWindow } from "../lib/quiet-time.js";

export async function processQuietSummaries(now: Date = new Date()): Promise<void> {
  const unsummarized = await prisma.poke.findMany({
    where: { type: "CASUAL", summarizedAt: null },
    select: { targetId: true },
    distinct: ["targetId"],
  });
  for (const { targetId } of unsummarized) {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { pokeQuietStartMinutes: true, pokeQuietEndMinutes: true, timezone: true },
    });
    if (!user) continue;
    const window = lastEndedQuietWindow(now, user.pokeQuietStartMinutes, user.pokeQuietEndMinutes, user.timezone ?? "Asia/Seoul");
    if (!window) continue;
    const pokes = await prisma.poke.findMany({
      where: {
        targetId,
        type: "CASUAL",
        summarizedAt: null,
        createdAt: { gte: window.start, lte: window.end },
      },
      select: { id: true },
    });
    if (!pokes.length) continue;
    const count = pokes.length;
    await createNotification({
      userId: targetId,
      type: "CASUAL_POKE_SUMMARY",
      title: "조용한 시간 동안 받은 찌르기",
      body: `조용한 시간 동안 ${count}건의 찌르기를 받았습니다.`,
      data: { count, windowStart: window.start.toISOString(), windowEnd: window.end.toISOString() },
      important: true,
    });
    await prisma.poke.updateMany({
      where: { id: { in: pokes.map((p) => p.id) } },
      data: { summarizedAt: now },
    });
  }
}
