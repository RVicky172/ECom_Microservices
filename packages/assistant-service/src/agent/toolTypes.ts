/**
 * Provider-neutral tool contract.
 *
 * Tools are written once against this shape. Each model provider adapts them
 * to its own API (Anthropic tool runner, OpenAI-style function calling).
 */
import type { z } from 'zod';
import type { EmitEvent } from './events';

/**
 * Throw from a tool's `run` to report an expected failure ("no such order")
 * back to the model as an error result it can explain to the customer.
 */
export class ToolFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolFailure';
  }
}

export interface AssistantTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  /** What the tool does and when to use it; the model reads this. */
  description: string;
  /** Validates the model's arguments; also converted to JSON Schema for the API. */
  inputSchema: Schema;
  /** Returns the result as a string (JSON) for the model. */
  run: (input: z.infer<Schema>) => Promise<string>;
}

/** Identity helper that keeps the input type of `run` tied to the schema. */
export const defineTool = <Schema extends z.ZodType>(tool: AssistantTool<Schema>): AssistantTool<Schema> => tool;

/**
 * Wraps a tool body so the UI sees progress ("Checking your orders…") and any
 * failure reaches the model as an `is_error` result it can explain, instead of
 * an exception that aborts the turn.
 */
export const instrumented = <Args>(
  name: string,
  emit: EmitEvent,
  body: (args: Args) => Promise<unknown>,
): ((args: Args) => Promise<string>) => {
  return async (args) => {
    emit({ type: 'tool_status', tool: name, state: 'running' });
    try {
      const result = await body(args);
      emit({ type: 'tool_status', tool: name, state: 'done' });
      return JSON.stringify(result);
    } catch (error) {
      emit({ type: 'tool_status', tool: name, state: 'error' });
      if (error instanceof ToolFailure) throw error;
      throw new ToolFailure(`The ${name} lookup failed because a store service is unavailable. Tell the customer to try again shortly.`);
    }
  };
};
