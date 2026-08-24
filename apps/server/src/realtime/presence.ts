const connectionCounts = new Map<string, number>();

export function connectUser(userId: string) {
  const previous = connectionCounts.get(userId) ?? 0;
  connectionCounts.set(userId, previous + 1);
  return previous === 0;
}

export function disconnectUser(userId: string) {
  const previous = connectionCounts.get(userId) ?? 0;
  if (previous <= 1) {
    connectionCounts.delete(userId);
    return previous === 1;
  }
  connectionCounts.set(userId, previous - 1);
  return false;
}

export function isUserOnline(userId: string) {
  return (connectionCounts.get(userId) ?? 0) > 0;
}
