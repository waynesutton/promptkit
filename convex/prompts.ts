import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
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

    const generatedQuestion = await ctx.scheduler.runAfter(0, api.prompts.generateQuestion, {
  sessionId,
  previousQuestions: [],
});

await ctx.db.insert("questions", {
  sessionId,
  question: generatedQuestion, // <-- make sure this is the actual question string
  order: 0,
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
      
      const enhancedPrompt = await ctx.scheduler.runAfter(0, api.prompts.generateEnhancedPrompt, {
        sessionId: args.sessionId,
      });
      
      await ctx.db.patch(args.sessionId, { enhancedPrompt });
      return;
    }

    await ctx.db.patch(args.sessionId, { currentStep: nextStep });

    const previousQuestions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const nextQuestion = await ctx.scheduler.runAfter(0, api.prompts.generateQuestion, {
      sessionId: args.sessionId,
      previousQuestions: previousQuestions.map(q => ({ 
        question: q.question, 
        answer: q.answer ?? null 
      })),
    });

    await ctx.db.insert("questions", {
      sessionId: args.sessionId,
      question: nextQuestion,
      order: nextStep,
    });
  },
});

export const generateQuestion = action({
  args: {
    sessionId: v.id("sessions"),
    previousQuestions: v.array(v.object({
      question: v.string(),
      answer: v.union(v.string(), v.null()),
    })),
  },
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.prompts.getSession, { 
      sessionId: args.sessionId 
    });
    if (!session) throw new Error("Session not found");

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system",
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
        role: "user",
        content: `Original prompt: "${session.originalPrompt}"\n\nPrevious questions and answers:\n${args.previousQuestions.map(q => `Q: ${q.question}\nA: ${q.answer ?? 'Not answered yet'}`).join('\n\n')}\n\nAsk one clarifying question:`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages,
    });

    return response.choices[0].message.content ?? "Could you provide more details?";
  },
});

export const generateEnhancedPrompt = action({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args): Promise<string> => {
    const session = await ctx.runQuery(api.prompts.getSession, { 
      sessionId: args.sessionId 
    });
    if (!session) throw new Error("Session not found");

    const questions = await ctx.runQuery(api.prompts.getQuestions, { 
      sessionId: args.sessionId 
    });

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system",
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
        role: "user",
        content: `
Original prompt: "${session.originalPrompt}"

Additional details:
${questions.map(q => `Q: ${q.question}\nA: ${q.answer ?? 'Not provided'}`).join('\n\n')}

Please output only the enhanced prompt in markdown format.
`.trim(),
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages,
    });

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
      content = JSON.stringify({
        original_prompt: session.originalPrompt,
        enhanced_prompt: session.enhancedPrompt,
        questions: questions.map((q) => ({
          question: q.question,
          answer: q.answer ?? null,
          order: q.order,
        })),
      }, null, 2);
    } else {
      content = `<?xml version="1.0" encoding="UTF-8"?>
<prompt_enhancement>
  <original_prompt><![CDATA[${session.originalPrompt}]]></original_prompt>
  <enhanced_prompt><![CDATA[${session.enhancedPrompt}]]></enhanced_prompt>
  <questions>
    ${questions.map((q) => `    <question order="${q.order + 1}">
      <text><![CDATA[${q.question}]]></text>
      <answer><![CDATA[${q.answer ?? ""}]]></answer>
    </question>`).join("\n")}
  </questions>
</prompt_enhancement>`;
    }

    return content;
  },
});
