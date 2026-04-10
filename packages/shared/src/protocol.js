import { z } from "zod";
import { nonNegativeIntegerSchema } from "./schemas.js";
export const PROTOCOL_VERSION = 1;
export function createEnvelope(type, payload, ts = Date.now()) {
    return { v: PROTOCOL_VERSION, type, ts, payload };
}
export function createEnvelopeSchema(type, payloadSchema) {
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
export function parseEnvelope(type, payloadSchema, raw) {
    const schema = createEnvelopeSchema(type, payloadSchema);
    return schema.parse(raw);
}
