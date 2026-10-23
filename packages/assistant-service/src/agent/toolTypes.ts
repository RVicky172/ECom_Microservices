/**
 * Provider-neutral tool contract.
 *
 * Tools are written once against this shape. Each model provider adapts them
 * to its own API (Anthropic tool runner, OpenAI-style function calling).
 */
import type { z } from 'zod';

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
