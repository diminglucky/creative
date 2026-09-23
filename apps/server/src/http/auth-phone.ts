import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  applicationErrorResponseSchema,
} from "@creative/shared";

import {
  PhoneAuthError,
  type PhoneAuthService,
} from "../features/auth/phone-auth-service.js";

const sendCodeSchema = z.object({ phone: z.string().min(6).max(32) });
const registerSchema = z.object({
  phone: z.string().min(6).max(32),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function registerPhoneAuthRoutes(
  app: FastifyInstance,
  options: { phoneAuthService: PhoneAuthService },
) {
  app.post("/api/auth/phone/send-code", async (request, reply) => {
    const parsed = sendCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "手机号格式无效" } });
    }
    try {
      await options.phoneAuthService.sendCode(parsed.data.phone, request.ip);
      return reply.code(204).send();
    } catch (error) {
      return sendPhoneAuthError(error, reply, "sms_send_failed");
    }
  });

  app.post("/api/auth/phone/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "手机号注册信息无效" } });
    }
    try {
      const result = await options.phoneAuthService.register({
        phone: parsed.data.phone,
        code: parsed.data.code,
        password: parsed.data.password,
        ...(parsed.data.displayName !== undefined
          ? { displayName: parsed.data.displayName }
          : {}),
      });
      return reply.code(201).send(result);
    } catch (error) {
      return sendPhoneAuthError(error, reply, "user_create_failed");
    }
  });
}

function sendPhoneAuthError(
  error: unknown,
  reply: any,
  fallbackCode: "sms_send_failed" | "user_create_failed",
) {
  if (error instanceof PhoneAuthError) {
    return reply.code(error.statusCode).send(
      applicationErrorResponseSchema.parse({
        error: { code: "invalid_request", message: error.message },
      }),
    );
  }
  return reply.code(500).send(
    applicationErrorResponseSchema.parse({
      error: { code: "application_error", message: fallbackCode },
    }),
  );
}
