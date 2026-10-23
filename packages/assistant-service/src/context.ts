/**
 * Who the current request is for.
 *
 * Built only from headers the API gateway sets after verifying the JWT. Tools
 * receive this object through a closure and never accept a user ID as model
 * input, so the model cannot ask for another user's data.
 */
export interface RequestContext {
  userId: string;
  correlationId: string;
  /** The chat this turn belongs to; a handoff is recorded per conversation. */
  conversationId: string;
}
