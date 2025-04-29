import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Id } from "../convex/_generated/dataModel";
import { toast } from "sonner";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import {
  ClipboardCopy,
  BarChartHorizontalBig,
  Github,
  Download,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
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
  const [isSubmitting, setIsSubmitting] = useState(false); // State to track submission

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

  // Determine if the session is in a thinking state
  const isGeneratingQuestion = sessionId && session?.status === "questioning" && !currentQuestion;
  const isGeneratingEnhancedPrompt =
    sessionId &&
    (session?.status === "enhancing" ||
      (session?.sessionType === "oneshot" && session?.status !== "complete"));
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
    // No longer submitting on Enter
  };

  const handleAnswerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && answer.trim()) {
      event.preventDefault(); // Prevent newline
      handleAnswer(event as any); // Trigger submit (cast event type if needed)
    }
  };

  // Handler for starting the interactive session
  const handleStartInteractive = async () => {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = await startSession({ prompt: prompt.trim(), sessionType: "interactive" });
      setSessionId(id);
      setPrompt("");
    } catch (error) {
      console.error("Failed to start interactive session:", error);
      toast.error("Failed to start session. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler for starting the one-shot refinement session
  const handleStartOneShot = async () => {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const id = await startSession({ prompt: prompt.trim(), sessionType: "oneshot" });
      setSessionId(id);
      setPrompt("");
    } catch (error) {
      console.error("Failed to start one-shot session:", error);
      toast.error("Failed to start session. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnswer = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!sessionId || !answer.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitAnswer({ sessionId, answer: answer.trim() });
      setAnswer("");
    } catch (error) {
      console.error("Failed to submit answer:", error);
      toast.error("Failed to submit answer. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
              <h1 className="text-3xl sm:text-3xl font-bold bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Prompt Enhancement
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

            <div className="space-y-4">
              <div className="relative group">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  placeholder="What do you want to build? Enter your prompt here..."
                  className="w-full h-40 p-4 rounded-xl border border-gray-200 bg-white/50 backdrop-blur-sm
                            focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 outline-none
                            transition-all duration-200 ease-in-out
                            text-gray-700 placeholder-gray-400
                            shadow-sm hover:shadow-md"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleStartInteractive}
                    disabled={!prompt.trim() || isSubmitting}
                    className="w-full py-3 px-4 bg-black text-white rounded-xl font-medium
                                shadow-lg shadow-black/20
                                transition-all duration-200 ease-in-out
                                hover:bg-gray-900 hover:shadow-xl hover:shadow-black/30
                                focus:ring-2 focus:ring-black/20 focus:outline-none
                                disabled:opacity-50 disabled:cursor-not-allowed
                                disabled:hover:bg-black disabled:hover:shadow-lg">
                    {isSubmitting ? "Starting..." : "Start Enhancement"}
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-1">
                    3-question interactive flow
                  </p>
                </div>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleStartOneShot}
                    disabled={!prompt.trim() || isSubmitting}
                    className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium
                                shadow-lg shadow-blue-500/20
                                transition-all duration-200 ease-in-out
                                hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/30
                                focus:ring-2 focus:ring-blue-500/20 focus:outline-none
                                disabled:opacity-50 disabled:cursor-not-allowed
                                disabled:hover:bg-blue-600 disabled:hover:shadow-lg">
                    {isSubmitting ? "Starting..." : "One-Shot Refine"}
                  </button>
                  <p className="text-xs text-gray-500 text-center mt-1">
                    Refine immediately, no questions
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-white/50 backdrop-blur-sm p-6 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Original Prompt</h3>
              <p className="text-gray-600 leading-relaxed">{session?.originalPrompt}</p>
            </div>

            {session?.sessionType === "interactive" && (
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
            )}

            {isThinking && (
              <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                <p className="text-gray-600 font-medium animate-pulse">Thinking{thinkingDots}</p>
              </div>
            )}

            {session?.sessionType === "interactive" &&
              currentQuestion &&
              !currentQuestion.answer &&
              !isThinking && (
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
                    disabled={isSubmitting}
                  />
                  <button
                    type="submit"
                    disabled={!answer.trim() || isSubmitting}
                    className="w-full py-3 px-4 bg-black text-white rounded-xl font-medium
                            shadow-lg shadow-black/20
                            transition-all duration-200 ease-in-out
                            hover:bg-gray-900 hover:shadow-xl hover:shadow-black/30
                            focus:ring-2 focus:ring-black/20 focus:outline-none
                            disabled:opacity-50 disabled:cursor-not-allowed
                            disabled:hover:bg-black disabled:hover:shadow-lg">
                    {isSubmitting ? "Submitting..." : "Submit Answer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionId(null);
                      setPrompt("");
                      setAnswer("");
                    }}
                    className="w-full text-center text-xs text-gray-500 hover:text-gray-700 underline transition-colors duration-150 mt-2">
                    Restart
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
                                  hover:bg-gray-900 hover:shadow-md
                                  flex items-center justify-center gap-2">
                          <Download className="h-4 w-4" />
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
                                  hover:bg-[#D42A23] hover:shadow-md
                                  flex items-center justify-center gap-1.5">
                          Send {format.toUpperCase()}
                          <ExternalLink className="h-4 w-4" />
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
                                 focus:outline-none focus:ring-2 focus:ring-gray-300
                                 flex items-center justify-center gap-2">
                      <RotateCcw className="h-4 w-4" />
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
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-white relative">
      {location.pathname === "/" && (
        <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      )}

      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="cursor-pointer">
              <h2 className="text-2xl font-semibold text-black">RePrompt</h2>
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

      <footer className="text-center py-4 mt-auto">
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
            Cooked on Convex Chef
          </a>
          <span className="text-gray-300">|</span>
          <Link
            to="https://convex.dev/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Powered by Convex
          </Link>
          <span className="text-gray-300">|</span>
          {/* <a
            href="https://github.com/waynesutton/promptkit"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Open Source Repo
          </a> */}
        </div>
      </footer>
    </div>
  );
}
