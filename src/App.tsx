import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";
import { Id } from "../convex/_generated/dataModel";
import { toast } from "sonner";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { ClipboardCopy } from "lucide-react";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [answer, setAnswer] = useState("");

  const session = useQuery(api.prompts.getSession, sessionId ? { sessionId } : "skip");
  const questions = useQuery(api.prompts.getQuestions, sessionId ? { sessionId } : "skip") ?? [];

  const startSession = useMutation(api.prompts.startNewSession);
  const submitAnswer = useMutation(api.prompts.answerQuestion);
  const exportPrompt = useMutation(api.prompts.exportPrompt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const id = await startSession({ prompt: prompt.trim() });
    setSessionId(id);
    setPrompt("");
  };

  const handleAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !answer.trim()) return;

    await submitAnswer({ sessionId, answer: answer.trim() });
    setAnswer("");
  };

  const handleExport = async (format: "markdown" | "json" | "xml") => {
    if (!sessionId) return;

    const content = await exportPrompt({ sessionId, format });
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enhanced-prompt.${format === "markdown" ? "md" : format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  const currentQuestion = questions.find((q) => q.order === session?.currentStep);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="absolute top-0 z-[-2] h-screen w-screen bg-white bg-[radial-gradient(100%_50%_at_50%_0%,#00A3FF21_0%,#00A3FF00_50%,#00A3FF00_100%)]"></div>

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div>
              <h2
                className="text-2xl font-semibold text-black"
                onClick={() => window.location.reload()}
                style={{ cursor: "pointer" }}>
                PromptKit
              </h2>
              <p className="text-sm text-gray-500 font-medium">Markdown, JSON, XML—done.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-3xl mx-auto space-y-8">
          {!sessionId ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Enhance Your Prompt
                </h1>
                <p className="text-gray-500 text-lg">
                  Transform your ideas into detailed, structured prompts
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <InteractiveHoverButton
                  className="w-full sm:w-auto px-4 py-2 bg-white/50 backdrop-blur-sm rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100/50 border border-gray-200/50 transition-all duration-150"
                  onClick={() => setPrompt("Build a hacker news clone")}
                  text="Build Hacker News Clone"
                />
                <InteractiveHoverButton
                  className="w-full sm:w-auto px-4 py-2 bg-white/50 backdrop-blur-sm rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100/50 border border-gray-200/50 transition-all duration-150"
                  onClick={() => setPrompt("Build a discord clone")}
                  text="Build Discord Clone"
                />
                <InteractiveHoverButton
                  className="w-full sm:w-auto px-4 py-2 bg-white/50 backdrop-blur-sm rounded-lg text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-100/50 border border-gray-200/50 transition-all duration-150"
                  onClick={() => setPrompt("Build a reddit clone")}
                  text="Build Reddit Clone"
                />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative group">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter your prompt here..."
                    className="w-full h-40 p-4 rounded-xl border border-gray-200 bg-white/50 backdrop-blur-sm 
                             focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 outline-none
                             transition-all duration-200 ease-in-out
                             text-gray-700 placeholder-gray-400
                             shadow-sm hover:shadow-md"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className="w-full py-3 px-4 bg-black text-white rounded-xl font-medium
                           shadow-lg shadow-black/20
                           transition-all duration-200 ease-in-out
                           hover:bg-gray-900 hover:shadow-xl hover:shadow-black/30
                           focus:ring-2 focus:ring-black/20 focus:outline-none
                           disabled:opacity-50 disabled:cursor-not-allowed
                           disabled:hover:bg-black disabled:hover:shadow-lg">
                  Start Enhancement
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="bg-white/50 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Original Prompt</h3>
                <p className="text-gray-600 leading-relaxed">{session?.originalPrompt}</p>
              </div>

              <div className="space-y-4">
                {questions.map((q) => (
                  <div
                    key={q._id}
                    className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-100 
                                shadow-sm transition-all duration-200 ease-in-out hover:shadow-md">
                    <p className="font-medium text-gray-800">{q.question}</p>
                    {q.answer && (
                      <div className="mt-3 pl-4 border-l-2 border-gray-200">
                        <p className="text-gray-600">
                          <span className="font-medium text-gray-700">Answer:</span> {q.answer}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {currentQuestion && !currentQuestion.answer && (
                <form onSubmit={handleAnswer} className="space-y-4">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    className="w-full h-32 p-4 rounded-xl border border-gray-200 bg-white/50 backdrop-blur-sm
                             focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 outline-none
                             transition-all duration-200 ease-in-out
                             text-gray-700 placeholder-gray-400
                             shadow-sm hover:shadow-md"
                  />
                  <button
                    type="submit"
                    disabled={!answer.trim()}
                    className="w-full py-3 px-4 bg-black text-white rounded-xl font-medium
                             shadow-lg shadow-black/20
                             transition-all duration-200 ease-in-out
                             hover:bg-gray-900 hover:shadow-xl hover:shadow-black/30
                             focus:ring-2 focus:ring-black/20 focus:outline-none
                             disabled:opacity-50 disabled:cursor-not-allowed
                             disabled:hover:bg-black disabled:hover:shadow-lg">
                    Submit Answer
                  </button>
                </form>
              )}

              {session?.status === "complete" && session.enhancedPrompt && (
                <div className="space-y-8">
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 rounded-xl border border-gray-200/50 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold text-gray-800">Enhanced Prompt</h3>
                      <button
                        onClick={() => {
                          if (session?.enhancedPrompt) {
                            navigator.clipboard.writeText(session.enhancedPrompt);
                            toast.success("Enhanced prompt copied!");
                          }
                        }}
                        className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200/50 hover:text-gray-700 transition-colors duration-150"
                        title="Copy enhanced prompt">
                        <ClipboardCopy className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-gray-700 leading-relaxed">{session.enhancedPrompt}</p>
                  </div>

                  <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Export Options</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {["markdown", "json", "xml"].map((format) => (
                        <button
                          key={format}
                          onClick={() => handleExport(format as "markdown" | "json" | "xml")}
                          className="py-3 px-4 bg-black text-white rounded-xl
                                   font-medium
                                   transition-all duration-200 ease-in-out
                                   border border-black/5
                                   focus:outline-none focus:ring-2 focus:ring-black/20
                                   hover:bg-gray-900 hover:shadow-md">
                          {format.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        setSessionId(null);
                        setPrompt("");
                        setAnswer("");
                      }}
                      className="w-full py-3 px-4 bg-gray-100 text-black rounded-xl font-medium
                                 shadow-sm hover:bg-gray-200 transition-colors duration-150
                                 focus:outline-none focus:ring-2 focus:ring-gray-300">
                      Start Over
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
