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
  args: {
    prompt: v.string(),
    sessionType: v.optional(v.union(v.literal("interactive"), v.literal("oneshot"))),
  },
  handler: async (ctx, args) => {
    const type = args.sessionType ?? "interactive";
    const initialStatus = type === "oneshot" ? "enhancing" : "questioning";

    const sessionId = await ctx.db.insert("sessions", {
      originalPrompt: args.prompt,
      currentStep: 0,
      status: initialStatus,
      sessionType: type,
    });

    if (type === "oneshot") {
      await ctx.scheduler.runAfter(0, internal.prompts.generateOneShotRefinement, {
        sessionId,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.prompts.generateAndWriteQuestion, {
        sessionId,
        previousQuestions: [],
      });
    }

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
        status: "enhancing",
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
You are an AI assistant, an expert in building AI applications using platforms like  Bolt, Claude Code, ChatGPT, Lovable, Cursor, Convex Chef, Windsurf. You are also an expert full-stack developer and experienced vibe coder helping users create clear and structured application prompts for AI code-gen app builders.

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
You are an AI assistant, an expert in AI app building and structured prompt refinement. You instantly enhance the user's prompt for better AI code-gen or design output.

Your role is to rewrite the user's prompt in one-shot, without asking questions, by:
- Inferring their goal, task, or intent
- Adding plausible missing context (like features, UI elements, styling, or constraints)
- Rewriting the prompt into a structured, clear format optimized for AI interpretation

You never ask questions. Assume the user wants to generate now.

Example:
User: "Build a SaaS landing page"
Enhanced Prompt:
"Build a clean, responsive SaaS landing page for a product called 'FlowTrack'—an analytics tool for real-time user session tracking. Use a modern, minimal layout with Neue Haas Grotesk font and a cool-toned color scheme (#1E293B background, #3B82F6 accents). Include a hero section with headline and CTA ('Start Tracking Free'), a 3-column feature breakdown, a pricing table, and testimonials. Add smooth scroll animations using framer-motion."

Your output should ONLY be the enhanced version of the original prompt—clean, specific, and ready for AI generation.
`.trim(),
      },
      {
        role: "user" as const,
        content: `Original prompt: "${session.originalPrompt}"\n\nAdditional details:\n${questions.map((q) => `Q: ${q.question}\nA: ${q.answer ?? "Not provided"}`).join("\n\n")}\n\nPreferred format: ${session.selectedFormat ?? "markdown"}`,
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
        content: `
You are an AI assistant, an expert in building AI applications, AI code-gen platforms, and structured prompt engineering. You help users craft clear, detailed prompts for generating high-quality app code, designs, or workflows using AI.

Your role is to interactively analyze the user's prompt and ask 1–4 high-signal clarifying questions to fill in missing context. Then, rewrite the prompt using the answers.

Your goals:
- Identify the user's goal, specific task, or problem area
- Add necessary context like features, constraints, style preferences, tone, or functionality
- Rephrase the prompt into a format that's structured and easy for AI to follow

When asking questions, prioritize these categories in order:
1. What are you building? (product, brand, feature, or vibe)
2. Layout or fonts? (e.g., grid system, font family)
3. Color scheme? (prefer hex codes)
4. Animations or motion? (e.g., parallax, scroll-triggered)
5. Tone or copy? (real headlines, casual vs professional voice)
6. UI components? (e.g., forms, tables, hero sections)
7. Functionality? (e.g., auth, filters, dashboards)
8. What to avoid? (e.g., no templates, no corporate tone)

Example:
User: "Build a SaaS landing page"

You ask:
- "What's the name of the SaaS product and its purpose?"
- "Do you have preferred fonts or layout style?"
- "What's the primary call-to-action (CTA) or offer?"
- "Should I include testimonials, pricing, or a feature comparison section?"

Refined Prompt:
"Build a clean, responsive SaaS landing page for a product called 'FlowTrack'—an analytics tool for real-time user session tracking. Use a modern, minimal layout with Neue Haas Grotesk font and a cool-toned color scheme (#1E293B background, #3B82F6 accents). Include a hero section with headline and CTA ('Start Tracking Free'), a 3-column feature breakdown, a pricing table, and testimonials. Add smooth scroll animations using framer-motion."

Only ask clarifying questions when needed. If the user's request is already clear and complete, skip questions and directly enhance the prompt.

Your output should be either:
1. Up to 4 clarifying questions if key context is missing
2. The enhanced prompt after gathering details
`.trim(),
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
    await ctx.db.patch(args.sessionId, {
      enhancedPrompt: args.enhancedPrompt,
      status: "complete",
    });
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
        content: `
You are an AI assistant, an expert in AI app building and structured prompt refinement. You instantly enhance the user's prompt for better AI code-gen or design output.

Your role is to rewrite the user's prompt in one-shot, without asking questions, by:
- Inferring their goal, task, or intent
- Adding plausible missing context (like features, UI elements, styling, or constraints)
- Rewriting the prompt into a structured, clear format optimized for AI interpretation

You never ask questions. Assume the user wants to generate now.

Example:
User: "Build a SaaS landing page"
Enhanced Prompt:
"Build a clean, responsive SaaS landing page for a product called 'FlowTrack'—an analytics tool for real-time user session tracking. Use a modern, minimal layout with Neue Haas Grotesk font and a cool-toned color scheme (#1E293B background, #3B82F6 accents). Include a hero section with headline and CTA ('Start Tracking Free'), a 3-column feature breakdown, a pricing table, and testimonials. Add smooth scroll animations using framer-motion."

Your output should ONLY be the enhanced version of the original prompt—clean, specific, and ready for AI generation.  
`.trim(),
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

export const generateOneShotRefinement = internalAction({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(api.prompts.getSession, { sessionId: args.sessionId });
    if (!session) throw new Error("Session not found");

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system" as const,
        content: `
You are an AI assistant, an expert in building AI applications, an expert in AI code-gen applications, and an expert full-stack developer and experienced vibe coder helping users create clear and structured application prompts for AI code-gen app builders.

Your role is to immediately refine the user's original prompt into a clear, structured, and enhanced version suitable for an AI code-gen app builder.
Do not ask any questions. Directly output the refined prompt.

Your output should ONLY be the enhanced text prompt, with no extra explanation, headers, or formatting.
`.trim(),
      },
      {
        role: "user" as const,
        content: `Original prompt: "${session.originalPrompt}"\n\nRefine this prompt immediately:`,
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

export const listCompletedSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("status"), "complete"))
      .filter((q) => q.neq(q.field("enhancedPrompt"), undefined))
      .order("desc")
      .collect();

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
