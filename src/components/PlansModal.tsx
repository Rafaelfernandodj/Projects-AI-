import { useState, useEffect } from "react";
import { useStore, CustomPlan } from "../store/useStore";
import { db } from "../lib/firebase";
import { collection, getDocs, query, orderBy, doc, deleteDoc } from "firebase/firestore";
import { X, Check, Sparkles, BookOpen, Globe, Trash2, Layers } from "lucide-react";

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TEMPLATE_PLANS: CustomPlan[] = [
  {
    id: "tpl_interview",
    title: "Technical Job Interview",
    description: "Preparação intensiva para entrevistas de emprego na área de tecnologia ou negócios internacionais.",
    scenario: "Simulação de entrevista corporativa, respondendo sobre experiência passada, conquistas técnicas e lidando com perguntas comportamentais complexas.",
    languagePreference: "english",
    instructions: "Engage in a structured job interview. Ask hard questions about technical experience, conflict resolution, salary expectations, and cultural fit. Correct soft-skill vocabulary.",
    createdAt: 1718000000000,
  },
  {
    id: "tpl_immigration",
    title: "Airport & Immigration Desk",
    description: "Treino para passar pela alfândega e imigração internacional sem nervosismo.",
    scenario: "Você acabou de desembarcar e o oficial de imigração fará as perguntas habituais sobre o propósito da viagem, acomodação e fundos.",
    languagePreference: "mixed",
    instructions: "Roleplay as a strict immigration officer at JFK or Heathrow. Ask questions about hotel reservations, duration of stay, job in Brazil, and money. Guide the student to respond confidently.",
    createdAt: 1718000000001,
  },
  {
    id: "tpl_restaurant",
    title: "Dinner at a Five-Star Restaurant",
    description: "Pedir pratos, fazer observações especiais e lidar com situações comuns em jantares finos.",
    scenario: "Interação fluida com o garçom em um restaurante chique, pedindo recomendações, questionando alérgenos e fazendo o pagamento.",
    languagePreference: "portuguese",
    instructions: "Roleplay as a sophisticated waiter. Ask for reservations, take food/drink orders, handle special requests, and recommend wine. Correct vocabulary for dining etiquette.",
    createdAt: 1718000000002,
  },
  {
    id: "tpl_hotel",
    title: "Hotel Check-In & Issue Solving",
    description: "Resolver problemas comuns de hospedagem: check-in, reclamar de barulho ou pedir itens extras.",
    scenario: "Interagir no balcão de atendimento de um hotel, garantindo que suas preferências de quarto sejam aceitas e reportando um chuveiro quebrado.",
    languagePreference: "mixed",
    instructions: "Roleplay as a hotel receptionist. Process a check-in, explain breakfast/WiFi terms. Then generate an issue (e.g. shower cold, keys not working) and guide the student to resolve it.",
    createdAt: 1718000000003,
  }
];

export default function PlansModal({ isOpen, onClose }: PlansModalProps) {
  const { profile, activePlan, setActivePlan } = useStore();
  const [dbPlans, setDbPlans] = useState<CustomPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"templates" | "custom">("templates");

  const userId = profile?.userId;

  useEffect(() => {
    if (isOpen && userId) {
      loadCustomPlans();
    }
  }, [isOpen, userId]);

  const loadCustomPlans = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "users", userId, "customPlans"),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const loaded: CustomPlan[] = [];
      querySnapshot.forEach((doc) => {
        loaded.push({ id: doc.id, ...doc.data() } as CustomPlan);
      });
      setDbPlans(loaded);
    } catch (e) {
      console.error("[PLANS] Error fetching custom plans:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlan = async (planId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!userId) return;
    try {
      await deleteDoc(doc(db, "users", userId, "customPlans", planId));
      setDbPlans((prev) => prev.filter((p) => p.id !== planId));
      if (activePlan?.id === planId) {
        setActivePlan(null);
      }
    } catch (e) {
      console.error("[PLANS] Error deleting plan:", e);
    }
  };

  const handleSelectPlan = (plan: CustomPlan) => {
    setActivePlan(plan);
  };

  const handleClearPlan = () => {
    setActivePlan(null);
  };

  const handleChangeLanguagePreference = (lang: "portuguese" | "mixed" | "english") => {
    if (activePlan) {
      const updated = { ...activePlan, languagePreference: lang };
      setActivePlan(updated);
    }
  };

  if (!isOpen) return null;

  const currentPlans = activeTab === "templates" ? TEMPLATE_PLANS : dbPlans;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-brand-dark-light border-t sm:border border-brand-dark-border w-full max-w-2xl rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-250">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-brand-dark-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-brand-green/10 flex items-center justify-center">
              <BookOpen className="text-brand-green-glow animate-pulse" size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold text-brand-text">Planos de Estudo Personalizados</h2>
              <p className="text-[11px] sm:text-xs text-gray-400">Pratique com cenários focados e preferências de suporte</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info on Active Plan */}
        <div className="p-3 sm:p-4 mx-4 sm:mx-6 mt-3 sm:mt-4 bg-brand-dark rounded-xl border border-brand-green/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-3">
              <span className="flex h-2.5 w-2.5 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activePlan ? "bg-brand-green" : "bg-gray-500"}`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activePlan ? "bg-brand-green" : "bg-gray-500"}`}></span>
              </span>
              <div>
                <p className="text-[10px] sm:text-xs text-gray-400 uppercase font-bold tracking-wider">Plano Ativo no Live Mode</p>
                <p className="text-xs sm:text-sm font-semibold text-brand-text">
                  {activePlan ? activePlan.title : "Nenhum (Conversa Geral)"}
                </p>
              </div>
            </div>
            
            {activePlan && (
              <button
                onClick={handleClearPlan}
                className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
              >
                Limpar Ativo
              </button>
            )}
          </div>

          {activePlan && (
            <div className="mt-3 sm:mt-4 border-t border-brand-dark-border pt-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] py-0.5 px-2 bg-brand-green/10 text-brand-green-glow rounded font-bold border border-brand-green/20">
                  Preferência de Idioma: {activePlan.languagePreference === "portuguese" ? "Explicações em Português" : activePlan.languagePreference === "mixed" ? "Misturado (PT/EN)" : "100% Inglês"}
                </span>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-1 max-w-md italic">{activePlan.scenario}</p>
              </div>

              {/* Language Preferences */}
              <div className="flex items-center space-x-1 bg-brand-dark-light border border-brand-dark-border rounded-lg p-0.5 self-start">
                <button
                  onClick={() => handleChangeLanguagePreference("portuguese")}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${activePlan.languagePreference === "portuguese" ? "bg-brand-green text-brand-dark" : "text-gray-400 hover:text-white"}`}
                >
                  PT
                </button>
                <button
                  onClick={() => handleChangeLanguagePreference("mixed")}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${activePlan.languagePreference === "mixed" ? "bg-brand-green text-brand-dark" : "text-gray-400 hover:text-white"}`}
                >
                  Mix
                </button>
                <button
                  onClick={() => handleChangeLanguagePreference("english")}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${activePlan.languagePreference === "english" ? "bg-brand-green text-brand-dark" : "text-gray-400 hover:text-white"}`}
                >
                  EN
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 mt-3 sm:mt-4 flex border-b border-brand-dark-border gap-4">
          <button
            onClick={() => setActiveTab("templates")}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors relative ${activeTab === "templates" ? "text-brand-green-glow" : "text-gray-400 hover:text-white"}`}
          >
            Sugeridos (Templates)
            {activeTab === "templates" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green-glow"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors relative flex items-center gap-1.5 ${activeTab === "custom" ? "text-brand-green-glow" : "text-gray-400 hover:text-white"}`}
          >
            Gerados Pelo Chat
            {dbPlans.length > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand-green-glow animate-pulse"></span>
            )}
            {activeTab === "custom" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-green-glow"></span>
            )}
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 sm:space-y-3 scrollbar-thin scrollbar-thumb-brand-green/20 scrollbar-track-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-brand-green border-t-transparent animate-spin"></div>
              <p className="text-xs text-gray-400">Buscando seus planos personalizados...</p>
            </div>
          ) : currentPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="text-gray-600 mb-3" size={36} />
              <p className="text-sm text-brand-text font-bold">Nenhum plano gerado ainda</p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                Converse com o Liam no Chat de Texto e peça para ele criar um plano para sua próxima prática do Live Mode!
              </p>
            </div>
          ) : (
            currentPlans.map((plan) => {
              const isSelected = activePlan?.id === plan.id;
              return (
                <div
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  className={`group p-3 sm:p-4 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "bg-brand-green/10 border-brand-green/60 shadow-md shadow-brand-green/5"
                      : "bg-brand-dark hover:bg-white/5 border-brand-dark-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-bold text-brand-text text-xs sm:text-sm group-hover:text-brand-green-glow transition-colors">
                          {plan.title}
                        </h4>
                        {plan.id.startsWith("tpl_") && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-white/5 text-gray-400 border border-brand-dark-border rounded-md">
                            PRESET
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-gray-300 line-clamp-2 md:line-clamp-none">
                        {plan.description}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-gray-500 font-medium">
                        <span className="font-semibold text-gray-400">Contexto:</span> {plan.scenario}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-brand-green flex items-center justify-center text-brand-dark">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-gray-600 group-hover:border-brand-green flex items-center justify-center text-transparent group-hover:text-brand-green-glow text-xs transition-all">
                          ✓
                        </div>
                      )}

                      {!plan.id.startsWith("tpl_") && (
                        <button
                          onClick={(e) => handleDeletePlan(plan.id, e)}
                          className="p-1 px-2 text-gray-500 hover:text-red-400 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remover plano"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-brand-dark-border bg-brand-dark/50 flex justify-between items-center px-4 sm:px-6">
          <div className="flex items-center space-x-2 text-[10px] sm:text-xs text-brand-green-glow font-medium">
            <Sparkles size={14} />
            <span className="truncate max-w-[180px] sm:max-w-none">Peça novos cenários ao Liam no Chat de Texto!</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-brand-green text-brand-dark rounded-xl text-[11px] sm:text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
