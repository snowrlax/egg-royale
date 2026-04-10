import { z } from "zod";
export declare const PROTOCOL_VERSION: 1;
export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type MessageEnvelope<TType extends string, TPayload> = {
    v: ProtocolVersion;
    type: TType;
    ts: number;
    payload: TPayload;
};
export declare function createEnvelope<TType extends string, TPayload>(type: TType, payload: TPayload, ts?: number): MessageEnvelope<TType, TPayload>;
export declare function createEnvelopeSchema<TType extends string, TPayloadSchema extends z.ZodType>(type: TType, payloadSchema: TPayloadSchema): z.ZodObject<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<TType>;
    ts: z.ZodNumber;
    payload: TPayloadSchema;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<TType>;
    ts: z.ZodNumber;
    payload: TPayloadSchema;
}>, any> extends infer T ? { [k in keyof T]: T[k]; } : never, z.baseObjectInputType<{
    v: z.ZodLiteral<1>;
    type: z.ZodLiteral<TType>;
    ts: z.ZodNumber;
    payload: TPayloadSchema;
}> extends infer T_1 ? { [k_1 in keyof T_1]: T_1[k_1]; } : never>;
/**
 * Validate an incoming envelope against a known event type + payload schema.
 * Throws ZodError on invalid data.
 */
export declare function parseEnvelope<TType extends string, TPayloadSchema extends z.ZodType>(type: TType, payloadSchema: TPayloadSchema, raw: unknown): MessageEnvelope<TType, z.infer<TPayloadSchema>>;
