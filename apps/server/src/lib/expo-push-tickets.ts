export type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

export function classifyExpoPushTickets(tokens: string[], tickets: ExpoPushTicket[] | undefined) {
  const invalidTokens: string[] = [];
  const retryTokens: string[] = [];
  const failedTickets: ExpoPushTicket[] = [];

  tokens.forEach((token, index) => {
    const ticket = tickets?.[index];
    if (!ticket || ticket.details?.error === "MessageRateExceeded") {
      retryTokens.push(token);
      return;
    }
    if (ticket.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(token);
      return;
    }
    if (ticket.status === "error") failedTickets.push(ticket);
  });

  return { invalidTokens, retryTokens, failedTickets };
}
