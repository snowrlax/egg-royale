import { z } from "zod";
import { nonNegativeIntegerSchema } from "./schemas.js";

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export type MessageEnvelope<TType extends string, TPayload> = {
  v: ProtocolVersion;
  type: TType;
  ts: number;
  payload: TPayload;
};

export function createEnvelope<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
  ts: number = Date.now()
): MessageEnvelope<TType, TPayload> {
  return { v: PROTOCOL_VERSION, type, ts, payload };
}

export function createEnvelopeSchema<
  TType extends string,
  TPayloadSchema extends z.ZodType,
>(type: TType, payloadSchema: TPayloadSchema) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    ts: nonNegativeIntegerSchema,
    payload: payloadSchema,
  });
}

/**
 * Validate an incoming envelope against a known event type + payload schema.
 * Throws ZodError on invalid data.
 */
export function parseEnvelope<
  TType extends string,
  TPayloadSchema extends z.ZodType,
>(
  type: TType,
  payloadSchema: TPayloadSchema,
  raw: unknown
): MessageEnvelope<TType, z.infer<TPayloadSchema>> {
  const schema = createEnvelopeSchema(type, payloadSchema);
  return schema.parse(raw) as MessageEnvelope<TType, z.infer<TPayloadSchema>>;
}
