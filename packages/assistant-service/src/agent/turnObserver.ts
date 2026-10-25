/**
 * Watches the events of one chat turn on their way to the client and remembers
 * what analytics needs (012): tools called, whether a proposal or a handoff was
 * returned, and the error code. Holds no message text.
 */
import type { InteractionOutcome } from '@ecommerce/shared';
import type { AssistantErrorCode, AssistantEvent, EmitEvent } from './events';

/**
 * Wraps a turn's `emit`: pass every event through `emit`, then read `tools`, the outcome and the error code
 * when the turn ends.
 */
export class TurnObserver {
  private readonly toolNames: string[] = [];
  private sawProposal = false;
  private sawHandoff = false;
  private error: AssistantErrorCode | null = null;

  /** Returns an emit that records each event, then passes it on unchanged. */
  wrap(emit: EmitEvent): EmitEvent {
    return (event) => {
      this.record(event);
      emit(event);
    };
  }

  /** Tool names in call order, from `running` (a tool called twice appears twice). */
  get tools(): string[] {
    return [...this.toolNames];
  }

  get errorCode(): AssistantErrorCode | null {
    return this.error;
  }

  /** An error decides the outcome; otherwise refused > handoff > proposal > answered. */
  outcome(stopReason: string | null): InteractionOutcome {
    if (this.error === 'rate_limited') return 'limited';
    if (this.error) return 'error';
    if (stopReason === 'refusal') return 'refused';
    if (this.sawHandoff) return 'handoff';
    if (this.sawProposal) return 'proposal';
    return 'answered';
  }

  private record(event: AssistantEvent): void {
    if (event.type === 'tool_status' && event.state === 'running') this.toolNames.push(event.tool);
    else if (event.type === 'proposal') this.sawProposal = true;
    else if (event.type === 'handoff') this.sawHandoff = true;
    else if (event.type === 'error') this.error = event.code;
  }
}
