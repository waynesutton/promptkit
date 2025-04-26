import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  sessions: defineTable({
    originalPrompt: v.string(),
    currentStep: v.number(),
    enhancedPrompt: v.optional(v.string()),
    status: v.union(v.literal("questioning"), v.literal("complete")),
  }),
  questions: defineTable({
    sessionId: v.id("sessions"),
    question: v.string(),
    answer: v.optional(v.string()),
    order: v.number(),
  }).index("by_session", ["sessionId"]),
  exports: defineTable({
    sessionId: v.id("sessions"),
    format: v.union(v.literal("markdown"), v.literal("json"), v.literal("xml")),
    content: v.string(),
  }).index("by_session_and_format", ["sessionId", "format"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
