/**
 * Legacy SMTP error helpers retained for compatibility with existing campaign
 * retry logic. Email delivery itself is now handled by Gmail API OAuth.
 */
export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('quota') ||
    message.includes('daily user sending limit') ||
    message.includes('resource_exhausted') ||
    message.includes('429') ||
    message.includes('421') ||
    message.includes('450') ||
    message.includes('454') ||
    message.includes('deferred')
  );
}

export function isBounceError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes('550') ||
    message.includes('551') ||
    message.includes('552') ||
    message.includes('553') ||
    message.includes('554') ||
    message.includes('user unknown') ||
    message.includes('no such user') ||
    message.includes('mailbox unavailable') ||
    message.includes('does not exist') ||
    message.includes('recipient rejected') ||
    message.includes('invalid recipient') ||
    message.includes('bounce') ||
    message.includes('invalid argument')
  );
}
