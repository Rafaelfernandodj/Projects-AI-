import { useState } from 'react';
import { useStore, UserProfile } from '../store/useStore';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { evaluateOnboarding } from '../services/geminiService';
import { ChevronRight, CheckCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogoIcon } from '../components/ui/Logo';

export default function Onboarding() {
  const { user, setProfile } = useStore();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Memory Answers
  const [answers, setAnswers] = useState<Partial<UserProfile>>({
    displayName: '',
    age: '',
    fullName: '',
    schoolName: '',
    studyTime: '',
    perceivedLevel: '',
    shameLevel: '',
    difficulties: '',
    englishUnderstanding: '',
    goal: '',
    preferredSituation: '',
    learningPreference: '',
    languageProportion: '',
    practicalCheckAnswers: {
        name: '',
        age: '',
        likes: '',
        day: ''
    }
  });

  const nextStep = () => {
    if (step === 1 && (!answers.displayName || !answers.age)) {
        setErrorMsg("Preencha os campos obrigatórios para continuar.");
        return;
    }
    if (step >= 2 && step <= 5) {
        // Just move forward
    }
    setErrorMsg('');
    setStep(s => s + 1);
  };

  const prevStep = () => setStep(s => s - 1);

  const handleFinish = async () => {
      setIsProcessing(true);
      setErrorMsg('');

      // Build text for AI
      const dialogueText = `
      ALUNO RESPONDEU O QUESTIONÁRIO:
      - Quer ser chamado de: ${answers.displayName}
      - Idade: ${answers.age}
      - Tempo de estudo: ${answers.studyTime}
      - Nível percebido por ele mesmo: ${answers.perceivedLevel}
      - Vergonha de falar: ${answers.shameLevel}
      - Principal dificuldade: ${answers.difficulties}
      - Compreensão auditiva: ${answers.englishUnderstanding}
      - Objetivo: ${answers.goal}
      - O que quer praticar: ${answers.preferredSituation}
      - Aprende melhor: ${answers.learningPreference}
      - Preferência de uso de idioma (PT vs EN): ${answers.languageProportion}
      
      RESPOSTAS DO TESTE PRÁTICO (escritas pelo aluno):
      1. What is your name? -> ${answers.practicalCheckAnswers?.name}
      2. How old are you? -> ${answers.practicalCheckAnswers?.age}
      3. What do you like to do? -> ${answers.practicalCheckAnswers?.likes}
      4. Tell me about your day. -> ${answers.practicalCheckAnswers?.day}
      `;

      try {
        let currentUser = auth.currentUser;
        if (!currentUser && user) {
          currentUser = user as any;
        }

        console.log("[Onboarding] Identified currentUser:", currentUser ? (currentUser.uid || currentUser.email) : 'null');

        if (!currentUser) {
            throw new Error("unauthenticated");
        }

        if (currentUser && typeof currentUser.reload === "function") {
            try {
                await currentUser.reload();
                console.log("[Onboarding] currentUser reloaded successfully.");
            } catch (authErr) {
                console.warn("[Onboarding] Could not reload auth user:", authErr);
            }
        }

        let evaluation: any = {};
        try {
            console.log("[Onboarding] Starting AI Evaluation...");
            evaluation = await evaluateOnboarding(dialogueText);
            console.log("[Onboarding] AI Evaluation success:", evaluation);
        } catch (evalErr) {
            console.warn("[Onboarding] AI Evaluation failed, using safe defaults.", evalErr);
            evaluation = {
                level: 'Speaker',
                goal: answers.goal || 'General',
                difficulties: answers.difficulties || 'Speaking',
                confidence: answers.shameLevel || 'Medium',
            };
        }
        
        const normalizedEmail = (currentUser.email || currentUser.uid || '').trim().toLowerCase();
        if (!normalizedEmail) {
            throw new Error("unauthenticated");
        }

        console.log(`[Onboarding] Instantiating user doc ref for users/${normalizedEmail}`);
        const userDocRef = doc(db, 'users', normalizedEmail);
        let existingProfile: any = {};
        
        try {
            console.log("[Onboarding] Attempting to read existing profile...");
            const getDocPromise = getDoc(userDocRef);
            const getDocTimeout = new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
            const userDocSnap = await Promise.race([getDocPromise, getDocTimeout]) as any;
            
            if (userDocSnap && userDocSnap.exists && userDocSnap.exists()) {
                existingProfile = userDocSnap.data();
                console.log("[Onboarding] Existing profile found:", existingProfile);
            } else {
                console.log("[Onboarding] No existing profile found (or timeout).");
            }
        } catch (readErr: any) {
            console.warn("[Onboarding] Could not read previous profile, continuing with empty:", readErr);
        }

        const safeUserData = {
          email: normalizedEmail || "",
          fullName: answers.fullName || existingProfile?.fullName || answers.displayName || existingProfile?.displayName || "",
          name: answers.displayName || existingProfile?.name || existingProfile?.displayName || "",
          accessStatus: existingProfile?.accessStatus || "active",
          role: existingProfile?.role || "student",
          source: existingProfile?.source || "email_session",
          plan: existingProfile?.plan || "manual_or_cakto",
          onboardingCompleted: true,
          level: evaluation?.level || "",
          difficulties: evaluation?.difficulties || answers.difficulties || "",
          confidence: evaluation?.confidence || answers.shameLevel || "",
          goal: evaluation?.goal || answers.goal || "",
          updatedAt: new Date().toISOString(),

          // Preserve old data
          displayName: answers.displayName || existingProfile?.displayName || "Student",
          age: answers.age || existingProfile?.age || "",
          schoolId: existingProfile?.schoolId || 'global',
          schoolName: answers.schoolName || existingProfile?.schoolName || 'Public',
          studyTime: answers.studyTime || existingProfile?.studyTime || '',
          perceivedLevel: answers.perceivedLevel || existingProfile?.perceivedLevel || '',
          shameLevel: answers.shameLevel || existingProfile?.shameLevel || '',
          englishUnderstanding: answers.englishUnderstanding || existingProfile?.englishUnderstanding || '',
          preferredSituation: answers.preferredSituation || existingProfile?.preferredSituation || '',
          learningPreference: answers.learningPreference || existingProfile?.learningPreference || '',
          languageProportion: answers.languageProportion || existingProfile?.languageProportion || '',
          practicalCheckAnswers: answers.practicalCheckAnswers || existingProfile?.practicalCheckAnswers || {},
          
          points: existingProfile?.points !== undefined ? existingProfile.points : 10,
          streak: existingProfile?.streak !== undefined ? existingProfile.streak : 1,
          bestStreak: existingProfile?.bestStreak !== undefined ? existingProfile.bestStreak : 1,
          textSessions: existingProfile?.textSessions !== undefined ? existingProfile.textSessions : 0,
          liveSessions: existingProfile?.liveSessions !== undefined ? existingProfile.liveSessions : 0,
          timeSpent: existingProfile?.timeSpent !== undefined ? existingProfile.timeSpent : 0,
          createdAt: existingProfile?.createdAt || Date.now(),
          lastActiveDate: new Date().toISOString()
        };

        // Remove any fields with undefined value (and sanitize sub-objects)
        Object.keys(safeUserData).forEach((key) => {
          if ((safeUserData as any)[key] === undefined) {
             delete (safeUserData as any)[key];
          }
        });

        if (safeUserData.practicalCheckAnswers) {
          Object.keys(safeUserData.practicalCheckAnswers).forEach((key) => {
            if ((safeUserData.practicalCheckAnswers as any)[key] === undefined) {
              delete (safeUserData.practicalCheckAnswers as any)[key];
            }
          });
        }

        try {
            console.log("[Onboarding] Calling setDoc with merge true on users/" + normalizedEmail);
            const savePromise = setDoc(userDocRef, safeUserData, { merge: true });
            const saveTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
            await Promise.race([savePromise, saveTimeout]);
            console.log("[Onboarding] setDoc completed successfully.");
        } catch (saveErr: any) {
            console.error(`[Onboarding] setDoc failed - ErrorCode: ${saveErr.code}, Message: ${saveErr.message}`);
            if (saveErr.message === 'timeout' || saveErr.code === 'unavailable') {
                console.warn("[Onboarding] Saving offline or timed out, will sync later. Saving to local state.");
                localStorage.setItem('pendingProfileSetup', JSON.stringify(safeUserData));
            } else {
                throw saveErr; // Rethrow actual permission or format errors
            }
        }

        setStep(7); // Show success
        
        setTimeout(() => {
            setProfile(safeUserData as any);
            navigate('/');
        }, 3000);

      } catch (err: any) {
        console.error("[Onboarding] AI or Firestore Error details:", {
            code: err.code,
            message: err.message,
            stack: err.stack
        });
        
        let niceMessage = "Erro ao salvar! Verifique sua conexão e tente novamente.";
        if (err.message === 'unauthenticated') {
            niceMessage = "Sessão expirada. Por favor, atualize a página ou faça login novamente.";
        } else if (err.code === 'permission-denied') {
            niceMessage = "Permissão negada no banco de dados. Atualize o app e tente novamente.";
        }
        setErrorMsg(niceMessage + ` (Codigo: ${err.code || 'Desconhecido'})`);
        setIsProcessing(false);
      }
  };

  const ButtonSelect = ({ value, stateKey, options }: { value: string, stateKey: keyof UserProfile, options: string[] }) => (
    <div className="flex flex-col gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => setAnswers(prev => ({ ...prev, [stateKey]: opt }))}
          className={`px-4 py-3 rounded-xl border text-left transition-all ${
              value === opt 
              ? 'bg-brand-green/20 text-brand-green-glow border-brand-green-glow font-medium shadow-md' 
              : 'bg-brand-dark border-brand-dark-border text-gray-400 hover:border-brand-green/50 hover:text-brand-text'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  return (
    <div translate="no" className="notranslate min-h-screen bg-brand-dark flex flex-col md:items-center md:justify-center p-4">
      <div className="w-full max-w-xl bg-brand-dark-light md:rounded-3xl shadow-xl overflow-hidden flex flex-col h-full md:h-auto min-h-[90vh] md:min-h-0 border border-brand-dark-border">
        
        {/* Header */}
        <div className="bg-brand-dark p-6 text-brand-text text-center relative shrink-0 border-b border-brand-dark-border">
          <div className="w-16 h-16 bg-brand-dark-light border border-brand-dark-border rounded-full mx-auto mb-4 flex items-center justify-center p-2 shadow-lg">
             <LogoIcon className="w-full h-full text-brand-green" />
          </div>
          <h2 className="text-2xl font-serif font-bold">Conhecendo Você</h2>
          <p className="text-brand-green mt-1">Me ajude a adaptar as aulas pro seu estilo!</p>
          
          {step <= 6 && (
            <div className="absolute top-4 left-4 right-4 flex gap-1">
                {[1,2,3,4,5,6].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-green-glow' : 'bg-brand-dark-light'}`} />
                ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          {errorMsg && (
            <div className="p-4 bg-red-500/10 text-red-500 rounded-xl mb-4 text-sm border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2">
                <span className="flex-1">{errorMsg}</span>
                <button 
                  onClick={() => setIsProcessing(false)}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-lg transition-colors whitespace-nowrap"
                >
                  Continuar e Retentar
                </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 1 — Perfil Básico (Obrigatório)</h3>
              
              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Como você quer ser chamado?</label>
                 <input type="text" value={answers.displayName} onChange={e => setAnswers({...answers, displayName: e.target.value})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="Seu apelido..." />
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Me diga sua idade ou faixa etária</label>
                 <input type="text" value={answers.age} onChange={e => setAnswers({...answers, age: e.target.value})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="Ex: 25 anos" />
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Nome completo (opcional)</label>
                 <input type="text" value={answers.fullName} onChange={e => setAnswers({...answers, fullName: e.target.value})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="Nome completo" />
              </div>

              <div>
                 <label className="block text-sm font-medium text-gray-400 mb-1">Escola de inglês atual (opcional)</label>
                 <input type="text" value={answers.schoolName} onChange={e => setAnswers({...answers, schoolName: e.target.value})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="Nome da escola" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 2 — Histórico</h3>
              
              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3">Há quanto tempo você estuda inglês?</label>
                 <ButtonSelect stateKey="studyTime" value={answers.studyTime || ''} options={[
                     "Nunca estudei", "Comecei agora", "Alguns meses", "1 a 2 anos", "Mais de 2 anos"
                 ]} />
              </div>

              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3 mt-8">Como você considera seu inglês hoje?</label>
                 <ButtonSelect stateKey="perceivedLevel" value={answers.perceivedLevel || ''} options={[
                     "Muito iniciante", "Básico", "Intermediário", "Avançado"
                 ]} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 3 — Confiança e Barreiras</h3>
              
              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3">Você sente vergonha de falar inglês?</label>
                 <ButtonSelect stateKey="shameLevel" value={answers.shameLevel || ''} options={[
                     "Muita vergonha", "Um pouco", "Quase nenhuma"
                 ]} />
              </div>

              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3 mt-6">O que é mais difícil para você hoje?</label>
                 <ButtonSelect stateKey="difficulties" value={answers.difficulties || ''} options={[
                     "Falar (Speaking)", "Entender quando escuto (Listening)", "Vocabulário", "Gramática", "Montar frases", "Pronúncia"
                 ]} />
              </div>

              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3 mt-6">Quando alguém fala inglês com você:</label>
                 <ButtonSelect stateKey="englishUnderstanding" value={answers.englishUnderstanding || ''} options={[
                     "Não entendo quase nada", "Entendo palavras soltas", "Entendo frases simples", "Entendo boa parte"
                 ]} />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-8 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 4 — Onde vamos chegar?</h3>
              
              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3">Qual é seu principal objetivo com o inglês?</label>
                 <ButtonSelect stateKey="goal" value={answers.goal || ''} options={[
                     "Conversar de forma geral", "Viajar", "Mandar bem na escola", "Trabalho / Carreira", "Passar numa prova", "Entender filmes e músicas"
                 ]} />
              </div>

              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3 mt-6">Que tipo de situação você mais quer praticar no dia a dia?</label>
                 <ButtonSelect stateKey="preferredSituation" value={answers.preferredSituation || ''} options={[
                     "Apresentação pessoal", "Situações de viagem", "Restaurante", "Compras", "Vocabulário corporativo/trabalho", "Conversa solta do dia a dia"
                 ]} />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 5 — Estilo de Aprendizagem</h3>
              
              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3">Como você sente que aprende melhor?</label>
                 <ButtonSelect stateKey="learningPreference" value={answers.learningPreference || ''} options={[
                     "Vendo exemplos claros", "Falando e arriscando", "Escrevendo", "Repetindo até fixar", "Apenas ouvindo a língua"
                 ]} />
              </div>

              <div>
                 <label className="block text-sm font-bold text-gray-300 mb-3 mt-6">No começo, você prefere que o Liam fale:</label>
                 <ButtonSelect stateKey="languageProportion" value={answers.languageProportion || ''} options={[
                     "Mais em português com exemplos práticos em inglês (Iniciante)", 
                     "Metade português e metade inglês (Básico)", 
                     "Mais em inglês com pouco português para tirar dúvida (Intermediário)", 
                     "Quase tudo em inglês (Avançado)"
                 ]} />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6 animate-in slide-in-from-right fade-in duration-300">
              <h3 className="text-xl font-bold text-brand-text">Etapa 6 — Check-in Rápido!</h3>
              <p className="text-gray-400 text-sm mb-4">Tente responder em inglês. Se não souber, pode responder em português ou deixar em branco sem problemas!</p>
              
              <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-bold text-gray-300 mb-1">What is your name?</label>
                    <input type="text" value={answers.practicalCheckAnswers?.name} onChange={e => setAnswers({...answers, practicalCheckAnswers: {...answers.practicalCheckAnswers!, name: e.target.value}})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="My name is..." />
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-gray-300 mb-1">How old are you?</label>
                    <input type="text" value={answers.practicalCheckAnswers?.age} onChange={e => setAnswers({...answers, practicalCheckAnswers: {...answers.practicalCheckAnswers!, age: e.target.value}})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="I am..." />
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-gray-300 mb-1">What do you like to do in your free time?</label>
                    <input type="text" value={answers.practicalCheckAnswers?.likes} onChange={e => setAnswers({...answers, practicalCheckAnswers: {...answers.practicalCheckAnswers!, likes: e.target.value}})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow placeholder:text-gray-500" placeholder="I like to..." />
                 </div>
                 <div>
                    <label className="block text-sm font-bold text-gray-300 mb-1">Tell me something about your day.</label>
                    <textarea rows={3} value={answers.practicalCheckAnswers?.day} onChange={e => setAnswers({...answers, practicalCheckAnswers: {...answers.practicalCheckAnswers!, day: e.target.value}})} className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow resize-none placeholder:text-gray-500" placeholder="Today I..." />
                 </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in duration-500 py-12">
               <div className="w-24 h-24 bg-brand-green/20 text-brand-green-glow rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-green/30">
                  <CheckCircle size={48} />
               </div>
               <h2 className="text-3xl font-bold font-serif text-brand-text">Tudo pronto, {answers.displayName}!</h2>
               <p className="text-gray-400 max-w-sm mx-auto">
                 Analisamos o seu perfil. O Liam já sabe exatamente como falar com você.
               </p>
               <Loader2 size={32} className="animate-spin text-brand-green-glow mx-auto" />
            </div>
          )}

        </div>

        {/* Footer Controls */}
        {step <= 6 && (
          <div className="p-4 md:p-6 border-t border-brand-dark-border bg-brand-dark flex items-center justify-between shrink-0">
             {step > 1 ? (
                <button onClick={prevStep} disabled={isProcessing} className="px-6 py-3 font-semibold text-gray-400 hover:text-brand-text transition">
                  Voltar
                </button>
             ) : <div />}
             
             {step < 6 ? (
                <button onClick={nextStep} disabled={isProcessing} className="flex items-center gap-2 bg-brand-green-glow text-white px-8 py-3 rounded-xl font-bold hover:brightness-110 transition shadow-lg shadow-brand-green-glow/20">
                  Continuar <ChevronRight size={20} />
                </button>
             ) : (
                <button onClick={handleFinish} disabled={isProcessing} className="flex items-center gap-2 bg-brand-text text-brand-dark px-8 py-3 rounded-xl font-bold hover:brightness-90 transition shadow-lg">
                  {isProcessing ? <Loader2 className="animate-spin" size={20} /> : 'Finalizar!'}
                </button>
             )}
          </div>
        )}

      </div>
    </div>
  );
}
