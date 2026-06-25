import { useState, useEffect, useRef } from "react";
import { useStore, CustomPlan } from "../store/useStore";
import { chatWithLiamMultimodal } from "../services/chatGeminiService";
import { saveCustomStudyPlan } from "../services/memoryService";
import { Send, Sparkles, BookOpen, User, ArrowLeft, RefreshCw, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Message {
  id: string;
  role: "user" | "model" | "system";
  text: string;
}

export default function Chat() {
  const { profile, activePlan, setActivePlan } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Initialize with welcome message
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        role: "model",
        text: `Hey, ${profile?.displayName || "Buddy"}! Ready for a quick chat? 💬 Let's build a Custom Study Plan together! Tell me what scenario you want to test (e.g. Job Interview, traveling, restaurant, pub night).`,
      },
    ]);
  }, [profile]);

  // Scroll to bottom on updates
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !profile?.userId) return;

    const userText = input.trim();
    setInput("");
    setLoading(true);

    const userMessageId = `${Date.now()}-user`;
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", text: userText },
    ]);

    try {
      // Map previous messages to Gemini format
      // filter out system items as the API doesn't support system roles in chat content directly
      const chatHistory = messages
        .filter((m) => m.role !== "system" && m.id !== "welcome")
        .map((m) => ({
          role: m.role as "user" | "model",
          parts: [{ text: m.text }],
        }));

      const messageParts = [{ text: userText }];

      // Call the optimized Gemini Text chat
      const response = await chatWithLiamMultimodal(messageParts, chatHistory, profile);
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        // Detect 'save_custom_study_plan' tool being called by Gemini
        const call = functionCalls[0];
        if (call.name === "save_custom_study_plan" && call.args) {
          const args = call.args as any;
          
          // Save in firestore and set active in state
          const savedPlan = await saveCustomStudyPlan(profile.userId, {
            title: args.title,
            description: args.description,
            scenario: args.scenario,
            languagePreference: args.languagePreference || "mixed",
            instructions: args.instructions,
          });

          setActivePlan(savedPlan);

          // Render system message success indicators
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-system`,
              role: "system",
              text: `🎯 Plano "${args.title}" foi criado e ativado com sucesso!`,
            },
            {
              id: `${Date.now()}-model`,
              role: "model",
              text: response.text || `Awesome! I've created the customized "${args.title}" study plan. Click "Start Live" to jump right into it!`,
            }
          ]);
        }
      } else {
        const textResponse = response.text || "Sorry, I lost my train of thought. Can you repeat?";
        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-model`, role: "model", text: textResponse },
        ]);
      }
    } catch (err: any) {
      console.error("[CHAT] Error during conversational turn:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "system",
          text: `⚠️ Erro na conexão: ${err.message || "Tente novamente mais tarde."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div translate="no" className="notranslate flex flex-col h-[calc(100vh-4rem)] md:h-screen bg-brand-dark text-brand-text max-w-4xl mx-auto overflow-hidden animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="p-4 border-b border-brand-dark-border flex items-center justify-between bg-brand-dark-light shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors md:hidden"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
            <MessageSquare className="text-brand-green-glow" size={20} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold">Chat de Texto com Liam</h1>
            <p className="text-[11px] text-brand-green">Gere e configure Planos de Estudo</p>
          </div>
        </div>

        {/* Active Plan badge */}
        {activePlan && (
          <div className="hidden sm:flex items-center space-x-2 bg-brand-green/10 border border-brand-green/20 px-3 py-1.5 rounded-xl">
            <BookOpen size={14} className="text-brand-green`" />
            <span className="text-xs text-brand-text font-semibold line-clamp-1 max-w-[150px]">
              {activePlan.title} Ativo
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="flex justify-center my-2">
                <span className="text-xs font-semibold px-4 py-1.5 rounded-full bg-brand-green/10 border border-brand-green/20 text-brand-green-glow">
                  {m.text}
                </span>
              </div>
            );
          }

          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 max-w-[85%] ${
                isUser ? "ml-auto flex-row-reverse" : "mr-auto"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border text-xs font-bold ${
                  isUser
                    ? "bg-brand-green-glow text-brand-dark border-brand-green-glow"
                    : "bg-brand-dark-light border-brand-dark-border text-brand-green"
                }`}
              >
                {isUser ? "U" : "L"}
              </div>

              <div
                className={`p-3.5 rounded-2xl text-sm leading-relaxed shadow-md ${
                  isUser
                    ? "bg-brand-green text-brand-dark font-medium rounded-tr-none"
                    : "bg-brand-dark-light border border-brand-dark-border text-brand-text rounded-tl-none"
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-3 max-w-[85%] mr-auto">
            <div className="w-8 h-8 rounded-xl bg-brand-dark-light border border-brand-dark-border flex items-center justify-center text-brand-green text-xs font-bold">
              L
            </div>
            <div className="bg-brand-dark-light border border-brand-dark-border rounded-2xl rounded-tl-none p-4 flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-brand-green animate-bounce delay-100"></span>
              <span className="w-2 h-2 rounded-full bg-brand-green animate-bounce delay-200"></span>
              <span className="w-2 h-2 rounded-full bg-brand-green animate-bounce delay-300"></span>
            </div>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 border-t border-brand-dark-border bg-brand-dark-light flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Peça seu cenário: 'Quero treinar no aeroporto'..."
          disabled={loading}
          className="flex-1 bg-brand-dark text-sm rounded-xl px-4 py-3 border border-brand-dark-border text-brand-text focus:outline-none focus:border-brand-green/50 placeholder:text-gray-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-brand-green text-brand-dark hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:scale-100 p-3 rounded-xl cursor-pointer transition-all shrink-0 flex items-center justify-center"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
