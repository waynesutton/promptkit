import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Id } from "../convex/_generated/dataModel";
import { toast } from "sonner";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { ClipboardCopy, BarChartHorizontalBig } from "lucide-react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import TokensSavedPage from "./pages/TokensSavedPage";

// Helper moved outside or defined in utils if shared
const estimateTokens = (text: string | undefined | null): number => {
  return text?.length ?? 0; // Using character length as a proxy
};

function MainContent() {
  const [prompt, setPrompt] = useState("");
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [answer, setAnswer] = useState("");
  const [thinkingDots, setThinkingDots] = useState("."); // State for animated dots
  const location = useLocation();
  const answerTextareaRef = useRef<HTMLTextAreaElement>(null); // Ref for answer textarea

  useState(() => {
    if (location.pathname === "/" && sessionId) {
      // Reset state if needed
    }
  });

  const session = useQuery(api.prompts.getSession, sessionId ? { sessionId } : "skip");
  const questions = useQuery(api.prompts.getQuestions, sessionId ? { sessionId } : "skip") ?? [];

  const startSession = useMutation(api.prompts.startNewSession);
  const submitAnswer = useMutation(api.prompts.answerQuestion);
  const exportPrompt = useMutation(api.prompts.exportPrompt);

  const currentQuestion = questions.find((q) => q.order === session?.currentStep);
  const isGeneratingQuestion = sessionId && session?.status === "questioning" && !currentQuestion;
  const isGeneratingEnhancedPrompt =
    sessionId && session?.status === "complete" && !session.enhancedPrompt;
  const isThinking = isGeneratingQuestion || isGeneratingEnhancedPrompt;

  // Effect for animating thinking dots
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (isThinking) {
      intervalId = setInterval(() => {
        setThinkingDots((dots) => (dots.length < 3 ? dots + "." : "."));
      }, 500); // Change dots every 500ms
    } else {
      setThinkingDots("."); // Reset dots
    }
    // Cleanup interval on component unmount or when isThinking changes
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isThinking]);

  // Effect to focus answer textarea when session starts
  useEffect(() => {
    if (sessionId && currentQuestion && !currentQuestion.answer && answerTextareaRef.current) {
      // Focus shortly after state updates settle and element is likely visible
      setTimeout(() => {
        answerTextareaRef.current?.focus();
      }, 100); // Small delay ensures element is ready
    }
    // Dependency array includes things that determine if the answer box should be shown and focused
  }, [sessionId, currentQuestion, isThinking]);

  // Explicit handlers for Enter key submission
  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && prompt.trim()) {
      event.preventDefault(); // Prevent newline
      handleSubmit(event as any); // Trigger submit (cast event type if needed)
    }
  };

  const handleAnswerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && answer.trim()) {
      event.preventDefault(); // Prevent newline
      handleAnswer(event as any); // Trigger submit (cast event type if needed)
    }
  };

  const handleSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const id = await startSession({ prompt: prompt.trim() });
    setSessionId(id);
    setPrompt("");
  };

  const handleAnswer = async (e: React.FormEvent | React.KeyboardEvent) => {
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

  // Calculate potential savings for the current session
  const potentialSavings =
    session?.status === "complete" && session.enhancedPrompt && session.originalPrompt
      ? Math.max(0, estimateTokens(session.originalPrompt) - estimateTokens(session.enhancedPrompt))
      : 0;

  return (
    <>
      <div className="w-full max-w-3xl mx-auto space-y-8">
        {!sessionId ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Grammarly for AI Prompts
              </h1>
              <p className="text-gray-500 text-lg">
                Enhance your prompts with AI. Export via Markdown, JSON, XML for vibe coding.
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
                  onKeyDown={handlePromptKeyDown}
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

            {isThinking && (
              <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                <p className="text-gray-600 font-medium animate-pulse">Thinking{thinkingDots}</p>
              </div>
            )}

            {currentQuestion && !currentQuestion.answer && !isThinking && (
              <form onSubmit={handleAnswer} className="space-y-4">
                <textarea
                  ref={answerTextareaRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleAnswerKeyDown}
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

            {session?.status === "complete" && session.enhancedPrompt && !isThinking && (
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

                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
                  <div>
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
                  </div>

                  <hr className="border-gray-200" />

                  <div>
                    <h4 className="text-sm font-semibold text-gray-600 mb-3 text-center">
                      Send to Chef
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {["markdown", "json", "xml"].map((format) => (
                        <button
                          key={`send-${format}`}
                          onClick={async () => {
                            if (sessionId) {
                              try {
                                const content = await exportPrompt({
                                  sessionId,
                                  format: format as "markdown" | "json" | "xml",
                                });
                                const chefUrl = `https://chef.convex.dev/?prefill=${encodeURIComponent(content)}`;
                                window.open(chefUrl, "_blank");
                                toast.success(`Sent ${format.toUpperCase()} to Chef!`);
                              } catch (error) {
                                console.error("Failed to export or send prompt:", error);
                                toast.error("Failed to generate content for Chef.");
                              }
                            } else {
                              toast.error("Session not found.");
                            }
                          }}
                          className="py-2 px-3 bg-[#EE342E] text-white rounded-lg
                                  text-sm font-medium
                                  transition-all duration-200 ease-in-out
                                  border border-red-700/20
                                  focus:outline-none focus:ring-2 focus:ring-red-500/30
                                  hover:bg-[#D42A23] hover:shadow-md">
                          Send {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <hr className="border-gray-200" />

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to="/tokens" className="flex-1">
                      <button
                        className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium
                                    shadow-sm hover:bg-blue-700 transition-colors duration-150
                                    focus:outline-none focus:ring-2 focus:ring-blue-300 flex justify-center items-center gap-2">
                        <BarChartHorizontalBig className="h-4 w-4" />
                        View Savings
                      </button>
                    </Link>
                    <button
                      onClick={() => {
                        setSessionId(null);
                        setPrompt("");
                        setAnswer("");
                      }}
                      className="flex-1 py-3 px-4 bg-gray-100 text-black rounded-xl font-medium
                                 shadow-sm hover:bg-gray-200 transition-colors duration-150
                                 focus:outline-none focus:ring-2 focus:ring-gray-300">
                      Start Over
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-white">
        <div className="absolute top-0 z-[-2] h-screen w-screen bg-white bg-[radial-gradient(100%_50%_at_50%_0%,#00A3FF21_0%,#00A3FF00_50%,#00A3FF00_100%)]"></div>

        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link to="/" className="cursor-pointer">
                <h2 className="text-2xl font-semibold text-black">PromptKit</h2>
                <p className="text-sm text-gray-500 font-medium"></p>
              </Link>
              <nav>
                <Link
                  to="/tokens"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
                  title="View Token Savings">
                  <BarChartHorizontalBig className="h-4 w-4" /> Tokens Saved
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center px-1 pt-1 pb-2 sm:px-8 sm:pt-4 sm:pb-8">
          <Routes>
            <Route path="/" element={<MainContent />} />
            <Route path="/tokens" element={<TokensSavedPage />} />
          </Routes>
        </main>

        <footer className="text-center py-4 border-t border-gray-100 mt-auto">
          <div className="flex justify-center items-center space-x-4">
            <Link
              to="/tokens"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Tokens Saved
            </Link>
            <span className="text-gray-300">|</span>
            <a
              href="https://chef.convex.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Vibe Code with Convex Chef
            </a>
            <span className="text-gray-300">|</span>
            <a
              href="https://github.com/waynesutton/promptkit"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub Repository"
              className="text-gray-500 hover:text-gray-700 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="inline-block">
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-1.5 6-6.5.06-1.35-.49-2.6-1.5-3.5.49-1.2.46-2.5-.14-3.5A4.7 4.7 0 0 0 17 4c-1.5 0-2.8.6-4 1.5-1.2-.4-2.5-.4-4 0C7.8 4.6 6.5 4 5 4a4.7 4.7 0 0 0-2.86 1.1c-.6 1-.63 2.3-.14 3.5A4.3 4.3 0 0 0 1 12c0 5 3 6.5 6 6.5-1 1-1.5 2.5-1.5 3.5V22" />
              </svg>
            </a>
          </div>
        </footer>
      </div>
    </Router>
  );
}
