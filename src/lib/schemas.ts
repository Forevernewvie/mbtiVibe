import { z } from "zod";
import { APP_POLICY } from "@/config/app-policy";

export const assessmentStartSchema = z.object({
  sessionToken: z.string().min(10).optional(),
});

export const assessmentAnswerSchema = z.object({
  assessmentId: z.string().min(10),
  questionId: z.string().min(10),
  choiceId: z.string().min(10),
});

export const assessmentCompleteSchema = z.object({
  assessmentId: z.string().min(10),
});

export const checkoutSchema = z.object({
  assessmentId: z.string().min(10),
  priceCode: z.string().min(3),
  email: z.string().email().optional(),
});

export const weeklyCheckinSchema = z.object({
  assessmentId: z.string().min(10),
  executionScore: z.number().int().min(APP_POLICY.weeklyCheckin.minScore).max(APP_POLICY.weeklyCheckin.maxScore),
  focusScore: z.number().int().min(APP_POLICY.weeklyCheckin.minScore).max(APP_POLICY.weeklyCheckin.maxScore),
  confidenceScore: z.number().int().min(APP_POLICY.weeklyCheckin.minScore).max(APP_POLICY.weeklyCheckin.maxScore),
  note: z.string().max(APP_POLICY.weeklyCheckin.maxNoteLength).optional(),
});

export const experimentSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().max(1000).optional(),
  variants: z.array(z.string().min(1)).min(2),
  isActive: z.boolean().default(true),
});

export const actionPlanToggleSchema = z.object({
  planId: z.string().min(10),
  completed: z.boolean(),
});

export const supportTicketSchema = z.object({
  email: z.string().email(),
  subject: z.string().min(2).max(APP_POLICY.support.maxSubjectLength),
  message: z.string().min(10).max(APP_POLICY.support.maxMessageLength),
});
