import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Helper to estimate tokens (simple length-based proxy)
const estimateTokens = (text: string | undefined | null): number => {
  return text?.length ?? 0; // Using character length as a proxy
};

export default function TokensSavedPage() {
  // Fetch sessions including question counts
  const sessionsWithCounts = useQuery(api.prompts.listCompletedSessions);

  if (sessionsWithCounts === undefined) {
    return <div className="text-center p-8">Loading prompt data...</div>;
  }

  if (sessionsWithCounts.length === 0) {
    return (
      <div className="text-center p-8">
        No completed sessions found yet. Enhance a prompt first!
      </div>
    );
  }

  // Prepare data for the character count chart
  const chartData = sessionsWithCounts
    .map((session) => {
      const originalChars = estimateTokens(session.originalPrompt);
      const enhancedChars = estimateTokens(session.enhancedPrompt);
      return {
        id: session._id.substring(session._id.length - 6),
        original: originalChars,
        enhanced: enhancedChars,
      };
    })
    .slice(0, 15); // Limit to last 15 sessions

  // Calculate dashboard KPIs
  const totalPromptsEnhanced = sessionsWithCounts.length;
  const totalQuestionsAnswered = sessionsWithCounts.reduce(
    (sum, s) => sum + (s.questionCount ?? 0),
    0
  );
  const averageQuestions =
    totalPromptsEnhanced > 0 ? (totalQuestionsAnswered / totalPromptsEnhanced).toFixed(1) : 0;

  const totalOriginalChars = sessionsWithCounts.reduce(
    (sum, s) => sum + estimateTokens(s.originalPrompt),
    0
  );
  const totalEnhancedChars = sessionsWithCounts.reduce(
    (sum, s) => sum + estimateTokens(s.enhancedPrompt),
    0
  );
  const totalSavedChars = Math.max(0, totalOriginalChars - totalEnhancedChars);
  const percentReduction =
    totalOriginalChars > 0 ? ((totalSavedChars / totalOriginalChars) * 100).toFixed(1) : 0;

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-8 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent mb-2">
          Prompt Enhancement Dashboard
        </h1>
        <p className="text-gray-600">Visualizing the process of refining prompts with AI.</p>
      </div>

      {/* Updated KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Total Prompts Enhanced
          </h3>
          <p className="text-3xl font-bold text-green-600">
            {totalPromptsEnhanced.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">Completed Sessions</p>
        </div>
        <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Avg. Questions / Prompt
          </h3>
          <p className="text-3xl font-bold text-blue-600">{averageQuestions}</p>
          <p className="text-xs text-gray-500">Avg. Clarifications</p>
        </div>
        <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Avg. Char Reduction
          </h3>
          <p className="text-3xl font-bold text-purple-600">{percentReduction}%</p>
          <p className="text-xs text-gray-500">Original vs. Enhanced</p>
        </div>
      </div>

      {/* Kept Character Count Chart */}
      <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Character Count: Original vs. Enhanced (Last 15)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="id" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
            <Bar dataKey="original" fill="#fbbf24" name="Original Chars" />
            <Bar dataKey="enhanced" fill="#3b82f6" name="Enhanced Chars" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Refined Explanatory Text */}
      <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm text-sm text-gray-700 space-y-3">
        <h3 className="text-lg font-semibold text-gray-700">How Prompt Enhancement Helps</h3>
        <p>
          Crafting effective prompts for Large Language Models (LLMs) is key to getting good results
          efficiently. As discussed in{" "}
          <a
            href="https://incident.io/building-with-ai/optimizing-llm-prompts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline">
            Optimizing LLM prompts for low latency
          </a>
          , clear and structured prompts can significantly impact performance and cost, especially
          by reducing the need for lengthy, ambiguous outputs from the AI.
        </p>
        <p>This tool helps refine your initial ideas through clarification:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Guided Structuring:</strong> Answering clarifying questions adds necessary
            detail and structure to your initial concept.
          </li>
          <li>
            <strong>Enhanced Clarity:</strong> The final enhanced prompt is designed to be more
            comprehensive and less ambiguous than the original idea.
          </li>
          <li>
            <strong>Potential Downstream Savings:</strong> While we estimate savings based on
            character count changes here, the primary benefit is that a well-structured, enhanced
            prompt is likely to be understood more efficiently by other AI systems, potentially
            requiring fewer tokens for those systems to process and respond accurately.
          </li>
        </ul>
        <p className="text-xs text-gray-500 pt-2">
          *Note: Character count reduction is shown as a proxy for prompt transformation. Actual
          token usage depends on the specific LLM and tokenizer involved in any subsequent
          processing.*
        </p>
      </div>
    </div>
  );
}
