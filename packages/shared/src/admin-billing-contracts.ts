import { z } from "zod";

export const paymentMethodSchema = z.enum(["credits", "money"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const generationTypeSchema = z.enum(["image", "video"]);
export type GenerationType = z.infer<typeof generationTypeSchema>;

export const paymentPreferenceSchema = z.object({
  primaryMethod: paymentMethodSchema.default("credits"),
  autoFallback: z.boolean().default(false),
});
export type PaymentPreference = z.infer<typeof paymentPreferenceSchema>;

export const generationPriceSchema = z.object({
  modelId: z.string().min(1),
  generationType: generationTypeSchema,
  creditPrice: z.number().int().nonnegative(),
  moneyPriceFen: z.number().int().nonnegative(),
  enabled: z.boolean(),
});
export type GenerationPrice = z.infer<typeof generationPriceSchema>;

export const generationChargeSchema = z.object({
  id: z.string().min(1),
  paymentMethod: paymentMethodSchema,
  creditsCharged: z.number().int().nonnegative(),
  moneyChargedFen: z.number().int().nonnegative(),
}).superRefine((charge, context) => {
  const usesCredits = charge.creditsCharged > 0;
  const usesMoney = charge.moneyChargedFen > 0;
  if (usesCredits === usesMoney) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A generation charge must use exactly one balance.",
    });
  }
  if (charge.paymentMethod === "credits" && !usesCredits) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Credit charge mismatch." });
  }
  if (charge.paymentMethod === "money" && !usesMoney) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Money charge mismatch." });
  }
});
export type GenerationCharge = z.infer<typeof generationChargeSchema>;

export const walletSummarySchema = z.object({
  credits: z.number().int().nonnegative(),
  moneyBalanceFen: z.number().int().nonnegative(),
  preference: paymentPreferenceSchema,
});
export type WalletSummary = z.infer<typeof walletSummarySchema>;
