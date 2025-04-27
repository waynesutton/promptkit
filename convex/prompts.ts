import { v } from "convex/values";
import { action, mutation, query, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";
import { Doc, Id } from "./_generated/dataModel";

const openai = new OpenAI({
  baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const startNewSession = mutation({
  args: { prompt: v.string() },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("sessions", {
      originalPrompt: args.prompt,
      currentStep: 0,
      status: "questioning",
    });

    await ctx.scheduler.runAfter(0, internal.prompts.generateAndWriteQuestion, {
      sessionId,
      previousQuestions: [],
    });

    return sessionId;
  },
});

export const answerQuestion = mutation({
  args: {
    sessionId: v.id("sessions"),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const currentQuestion = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("order"), session.currentStep))
      .unique();

    if (!currentQuestion) throw new Error("Question not found");

    await ctx.db.patch(currentQuestion._id, { answer: args.answer });

    const nextStep = session.currentStep + 1;

    if (nextStep >= 3) {
      await ctx.db.patch(args.sessionId, {
        status: "complete",
        currentStep: nextStep,
      });

      await ctx.scheduler.runAfter(0, internal.prompts.generateAndWriteEnhancedPrompt, {
        sessionId: args.sessionId,
      });
      return;
    }

    await ctx.db.patch(args.sessionId, { currentStep: nextStep });

    const previousQuestions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    await ctx.scheduler.runAfter(0, internal.prompts.generateAndWriteQuestion, {
      sessionId: args.sessionId,
      previousQuestions: previousQuestions.map((q) => ({
        question: q.question,
        answer: q.answer ?? null,
      })),
    });
  },
});

export const generateQuestion = action({
  args: {
    sessionId: v.id("sessions"),
    previousQuestions: v.array(
      v.object({
        question: v.string(),
        answer: v.union(v.string(), v.null()),
      })
    ),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.prompts.getSession, {
      sessionId: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system" as const,
        content: `
You are an AI assistant and expert in building AI applications using platforms like Convex Chef, Bolt, ChatGPT Lovable, Cursor, and Windsurf. You are also an expert full-stack developer and experienced vibe coder.

Your role is to ask one concise, high-signal clarifying question to better understand the user's original prompt and help improve it. Only ask a question if the user's prompt is ambiguous or incomplete.

Never ask a question if the user is clearly trying to deploy or build their app immediately — assume they're ready to generate now.

Your output should ONLY be the enhanced text prompt of the clarifying question in the selected format with no extra explanation or headers or formatting.
`.trim(),
      },
      {
        role: "user" as const,
        content: `Original prompt: "${session.originalPrompt}"

Previous questions and answers:
${args.previousQuestions
  .map((q) => `Q: ${q.question}\nA: ${q.answer ?? "Not answered yet"}`)
  .join("\n\n")}

Ask one clarifying question:`,
      },
    ];

    const response = await openai.chat.completions.create({ model: "gpt-4o", messages });

    return response.choices[0].message.content ?? "Could you provide more details?";
  },
});

export const generateEnhancedPrompt = action({
  args: {
    sessionId: v.id("sessions"),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.prompts.getSession, {
      sessionId: args.sessionId,
    });
    if (!session) throw new Error("Session not found");

    const questions = await ctx.runQuery(api.prompts.getQuestions, {
      sessionId: args.sessionId,
    });

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system" as const,
        content: `
You are an AI assistant helping users create clear and structured application prompts.

Your job:
1. Given the user's original idea and their answers to up to 3 clarification questions, generate a refined, enhanced prompt that fully describes the intended app or system.
2. Then, format the enhanced prompt in the output format the user requested: Markdown, JSON, or XML.
3. Do not include code — just return the enhanced prompt as a formatted specification.

Your output should ONLY be the enhanced prompt in the selected format, with no extra explanation or headers.

If the user didn't select a format, return it in Markdown by default.
`.trim(),
      },
      {
        role: "user" as const,
        content: `
Original prompt: "${session.originalPrompt}"

Additional details:
${questions.map((q) => `Q: ${q.question}\nA: ${q.answer ?? "Not provided"}`).join("\n\n")}

Preferred format: ${session.selectedFormat ?? "markdown"}

Please output only the enhanced prompt in the selected format.
`.trim(),
      },
    ];

    const response = await openai.chat.completions.create({ model: "gpt-4o", messages });

    return response.choices[0].message.content ?? session.originalPrompt;
  },
});

export const getSession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const getQuestions = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

export const exportPrompt = mutation({
  args: {
    sessionId: v.id("sessions"),
    format: v.union(v.literal("markdown"), v.literal("json"), v.literal("xml")),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session?.enhancedPrompt) throw new Error("Enhanced prompt not found");

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    let content = "";

    if (args.format === "markdown") {
      content = `# Enhanced Prompt\n\n${session.enhancedPrompt}\n\n## Original Prompt\n\n${
        session.originalPrompt
      }\n\n## Clarifying Questions\n\n${questions
        .map((q) => `### Q${q.order + 1}: ${q.question}\n\n${q.answer ?? "*Not answered*"}`)
        .join("\n\n")}`;
    } else if (args.format === "json") {
      content = JSON.stringify(
        {
          original_prompt: session.originalPrompt,
          enhanced_prompt: session.enhancedPrompt,
          questions: questions.map((q) => ({
            question: q.question,
            answer: q.answer ?? null,
            order: q.order,
          })),
        },
        null,
        2
      );
    } else {
      content = `<?xml version="1.0" encoding="UTF-8"?>
<prompt_enhancement>
  <original_prompt><![CDATA[${session.originalPrompt}]]></original_prompt>
  <enhanced_prompt><![CDATA[${session.enhancedPrompt}]]></enhanced_prompt>
  <questions>
    ${questions
      .map(
        (q) => `    <question order="${q.order + 1}">
      <text><![CDATA[${q.question}]]></text>
      <answer><![CDATA[${q.answer ?? ""}]]></answer>
    </question>`
      )
      .join("\n")}
  </questions>
</prompt_enhancement>`;
    }

    return content;
  },
});

export const writeQuestion = internalMutation({
  args: { sessionId: v.id("sessions"), question: v.string(), order: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("questions", {
      sessionId: args.sessionId,
      question: args.question,
      order: args.order,
    });
    return null;
  },
});

export const generateAndWriteQuestion = internalAction({
  args: {
    sessionId: v.id("sessions"),
    previousQuestions: v.array(
      v.object({ question: v.string(), answer: v.union(v.string(), v.null()) })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.prompts.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Session not found");
    const messages = [
      {
        role: "system" as const,
        content:
          "You are an AI assistant whose job is to ask one concise clarifying question to better understand the user's original prompt. Your output should ONLY be the question text itself.",
      },
      {
        role: "user" as const,
        content: `Original prompt: "${session.originalPrompt}"\n\nPrevious questions and answers:\n${args.previousQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer ?? "Not answered yet"}`).join("\n\n")}\n\nAsk one clarifying question:`,
      },
    ];
    const response = await openai.chat.completions.create({ model: "gpt-4o", messages });
    const question = response.choices[0].message.content ?? "Could you provide more details?";
    await ctx.runMutation(internal.prompts.writeQuestion, {
      sessionId: args.sessionId,
      question,
      order: session.currentStep,
    });
    return null;
  },
});

export const writeEnhancedPrompt = internalMutation({
  args: { sessionId: v.id("sessions"), enhancedPrompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { enhancedPrompt: args.enhancedPrompt });
    return null;
  },
});

export const generateAndWriteEnhancedPrompt = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.prompts.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Session not found");
    const questions = await ctx.runQuery(api.prompts.getQuestions, { sessionId: args.sessionId });
    const messages = [
      {
        role: "system" as const,
        content:
          "You are an AI assistant helping users create clear and structured application prompts. Your output should ONLY be the enhanced prompt in the selected format with no extra explanation or headers.",
      },
      {
        role: "user" as const,
        content: `Original prompt: "${session.originalPrompt}"\n\nAdditional details:\n${questions.map((q) => `Q: ${q.question}\nA: ${q.answer ?? "Not provided"}`).join("\n\n")}\n\nPreferred format: ${session.selectedFormat ?? "markdown"}`,
      },
    ];
    const response = await openai.chat.completions.create({ model: "gpt-4o", messages });
    const enhanced = response.choices[0].message.content ?? session.originalPrompt;
    await ctx.runMutation(internal.prompts.writeEnhancedPrompt, {
      sessionId: args.sessionId,
      enhancedPrompt: enhanced,
    });
    return null;
  },
});

// Updated query to list completed sessions AND their question counts
export const listCompletedSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("status"), "complete"))
      .filter((q) => q.neq(q.field("enhancedPrompt"), undefined))
      .order("desc")
      .collect();

    // Fetch question count for each session
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session) => {
        const questions = await ctx.db
          .query("questions")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect();
        return {
          ...session,
          questionCount: questions.length,
        };
      })
    );

    return sessionsWithCounts;
  },
});
