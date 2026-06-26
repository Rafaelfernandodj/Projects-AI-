import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { LogoIcon } from '../components/ui/Logo';
import { Mail, CheckCircle2, AlertCircle, HelpCircle, BookOpen, Volume2, ShieldAlert, Cpu, Sparkles, MessageSquare, Gauge, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { verifyEmailInLiamDB, verifyEmailInCakto } from '../utils/authValidation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNoAccessModal, setShowNoAccessModal] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);

  // Diagnostic tool states
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestLoading, setIsTestLoading] = useState(false);
  
  const { setUser, setProfile } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('liam_blocked_wrong_email_msg') === 'true') {
      localStorage.removeItem('liam_blocked_wrong_email_msg');
      setError('Não encontramos uma compra ativa vinculada exatamente a este e-mail. Verifique se digitou corretamente ou compre o acesso ao LIAM.');
      setShowNotFoundModal(true);
    }
  }, []);

  const checkHealth = async () => {
    setIsHealthLoading(true);
    setHealthStatus(null);
    try {
      const res = await fetch('/api/caktoHealthCheck');
      const data = await res.json();
      setHealthStatus(data);
    } catch (err: any) {
      setHealthStatus({ ok: false, message: err.message || 'Erro ao conectar no servidor' });
    } finally {
      setIsHealthLoading(false);
    }
  };

  const handleTestEmailInCakto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setIsTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/testCaktoEmail?email=${encodeURIComponent(testEmail.trim())}`);
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ error: err.message || 'Erro do servidor' });
    } finally {
      setIsTestLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanEmail = email.trim().toLowerCase();
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Por favor, insira um e-mail válido.');
      return;
    }

    setIsLoading(true);
    
    console.log(`[Login] E-mail informado: ${cleanEmail}`);

    try {
      // 1. Check Liam DB
      const foundInDB = await verifyEmailInLiamDB(cleanEmail);
      
      if (foundInDB) {
        console.log(`[Login] E-mail encontrado no banco. Acesso liberado.`);
        
        const userData = foundInDB.data || {};
        
        const session = {
          userId: foundInDB.docId, // can be custom uid or email
          email: cleanEmail,
          accessStatus: userData.accessStatus || 'active',
          source: userData.source || foundInDB.collectionName || 'liam',
          role: userData.role || 'student',
          plan: userData.plan || 'liam_student',
          loggedInAt: new Date().toISOString()
        };

        // Save session locally
        localStorage.setItem('liam_user_session', JSON.stringify(session));
        
        // Update Zustand store
        setUser({ uid: session.userId, email: cleanEmail } as any);
        setProfile({ userId: session.userId, ...userData } as any);

        // Check onboarding completion
        if (userData.level && userData.level !== 'Unassigned') {
          console.log('[Login] Onboarding já completo. Redirecionando para Home...');
          navigate('/');
        } else {
          console.log('[Login] Onboarding pendente. Redirecionando para formulário inicial...');
          navigate('/onboarding');
        }
        return;
      }

      // 2. If not found in Liam DB, search Cakto
      console.log(`[Login] E-mail não encontrado no banco. Consultando Cakto...`);
      const foundInCakto = await verifyEmailInCakto(cleanEmail);
      
      if (foundInCakto === true) {
        console.log(`[Login] Compra encontrada na Cakto. Acesso liberado.`);
        console.log(`[Login] Criando usuário no banco do LIAM...`);

        // Create user automatically with requirements
        const newUserProfile = {
          userId: cleanEmail,
          email: cleanEmail,
          accessStatus: 'active',
          source: 'cakto',
          role: 'student',
          plan: 'cakto',
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
          onboardingCompleted: false,
          displayName: cleanEmail.split('@')[0],
          // Minimal defaults so system doesn't break
          points: 10,
          streak: 1,
          bestStreak: 1,
          textSessions: 0,
          liveSessions: 0,
          timeSpent: 0
        };

        // Write to users collection
        await setDoc(doc(db, 'users', cleanEmail), newUserProfile);
        console.log(`[Login] Usuário criado. Redirecionando para onboarding.`);

        // Save session
        const session = {
          userId: cleanEmail,
          email: cleanEmail,
          accessStatus: 'active',
          source: 'cakto',
          role: 'student',
          plan: 'cakto',
          loggedInAt: new Date().toISOString()
        };
        localStorage.setItem('liam_user_session', JSON.stringify(session));

        // Update Zustand store
        setUser({ uid: cleanEmail, email: cleanEmail } as any);
        setProfile(newUserProfile as any);

        navigate('/onboarding');
        return;
      } else if (foundInCakto === 'waiting_payment') {
        console.log(`[Login] Exibindo popup de compra/aguardar pagamento.`);
        setError('Produto LIAM encontrado, mas pagamento ainda pendente.');
        setShowNotFoundModal(true);
        return;
      }

      // 3. Not found in DB nor Cakto
      console.log(`[Login] E-mail não encontrado no banco nem na Cakto. Exibindo popup de compra.`);
      setShowNotFoundModal(true);

    } catch (err: any) {
      console.error('[Login] Erro durante o fluxo de login:', err);
      setError('Ocorreu um erro ao validar seu acesso. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark text-brand-text overflow-y-auto selection:bg-brand-green/30 selection:text-white relative">
      
      {/* Dynamic Topbar Ribbon */}
      <div className="bg-gradient-to-r from-red-500 via-brand-green-glow to-blue-600 text-white py-2 px-4 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-2 relative z-20 animate-pulse">
        <Sparkles size={14} className="shrink-0" />
        <span>NOVA FUNÇÃO: Crie planos personalizados via Chat e treine no seu ritmo (0.8x a 1.2x)!</span>
      </div>

      {/* Header/Navbar */}
      <header className="sticky top-0 z-30 bg-brand-dark/85 backdrop-blur-md border-b border-brand-dark-border py-4 px-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div className="w-9 h-9 rounded-xl bg-brand-dark-light border border-brand-dark-border flex items-center justify-center p-1.5 shadow-sm">
            <LogoIcon className="w-full h-full text-brand-green" />
          </div>
          <span className="font-bold text-lg font-serif tracking-tight text-white">Liam AI</span>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => scrollToSection('login-form-section')}
            className="px-4 py-2 border border-brand-dark-border text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all hover:bg-white/5 cursor-pointer"
          >
            Já sou aluno
          </button>
          <button 
            onClick={() => scrollToSection('pricing-section')}
            className="px-4 py-2 bg-brand-green text-brand-dark rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-md shadow-brand-green/10"
          >
            Falar com Liam
          </button>
        </div>
      </header>

      {/* Radial Glows */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-green/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[20%] left-1/3 w-[500px] h-[500px] bg-brand-green-glow/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Section */}
      <section className="py-16 md:py-24 px-6 max-w-6xl mx-auto text-center relative z-10 space-y-8">
        <div className="space-y-4">
          <span className="px-3 py-1 bg-brand-green/10 text-brand-green-glow rounded-full text-xs font-bold border border-brand-green/20 uppercase tracking-widest inline-flex items-center gap-1.5">
            <Cpu size={12} /> Coach de Inglês por Voz 24h
          </span>
          <h1 className="text-4xl md:text-6xl font-serif font-bold text-white max-w-4xl mx-auto leading-tight tracking-tight">
            Destrave seu inglês falado praticando com um <span className="text-brand-green-glow">nativo artificial</span>
          </h1>
          <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto font-medium">
            Simule entrevistas gringas, alfândegas e conversas do dia a dia. O único com avaliação fonética em português, controle de velocidade e criação de planos personalizados via Chat.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <button 
            onClick={() => scrollToSection('pricing-section')}
            className="w-full sm:w-auto px-8 py-4 bg-brand-green text-brand-dark font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all text-sm shadow-xl shadow-brand-green/10 cursor-pointer"
          >
            Destrave Seu Inglês Agora
          </button>
          <button 
            onClick={() => scrollToSection('login-form-section')}
            className="w-full sm:w-auto px-8 py-4 bg-transparent border-2 border-brand-dark-border text-white hover:bg-white/5 font-bold rounded-2xl transition-all text-sm cursor-pointer"
          >
            Acessar Minha Conta
          </button>
        </div>

        {/* Smartphone Mockup Showcasing App */}
        <div className="pt-8 max-w-sm mx-auto">
          <div className="bg-brand-dark-light border-8 border-brand-dark-border rounded-[40px] overflow-hidden shadow-2xl p-4 aspect-[9/16] relative flex flex-col justify-between text-left">
            {/* Camera notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-3.5 bg-brand-dark-border rounded-b-xl" />
            
            {/* App Mockup Header */}
            <div className="flex justify-between items-center pt-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-dark flex items-center justify-center p-1 border border-brand-dark-border">
                  <LogoIcon className="w-full h-full text-brand-green" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">Liam Live</h4>
                  <p className="text-[9px] font-semibold text-brand-green-glow flex items-center gap-1">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green-glow opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-green-glow"></span>
                    </span>
                    Respondendo
                  </p>
                </div>
              </div>
              <div className="px-2 py-0.5 border border-brand-green/20 bg-brand-dark rounded text-[8px] font-bold text-brand-green-glow">
                ⚡ 0.8x (Pausado)
              </div>
            </div>

            {/* App Mockup Dialog bubbles */}
            <div className="space-y-4 my-auto">
              <div className="bg-[#16253d]/50 p-3 rounded-xl border border-brand-dark-border max-w-[85%]">
                <span className="text-[9px] text-brand-green-glow font-bold block mb-0.5">Você disse:</span>
                <p className="text-xs text-white">"Hello, my *neimi* is Lucas..."</p>
              </div>
              
              <div className="p-3 max-w-[90%] space-y-1">
                <span className="text-[9px] text-brand-green font-bold block">Liam:</span>
                <p className="text-sm serif-font text-white leading-relaxed italic">
                  "Quase! Em 'name', o 'E' final é mudo e o som termina fechando os lábios no 'M'. Não diga 'neimi'. Repete: **neim**."
                </p>
              </div>

              {/* Pulsing Audio wave */}
              <div className="flex justify-center items-center gap-1.5 h-10 pt-2">
                <div className="w-1 h-6 bg-brand-green-glow rounded-full animate-pulse"></div>
                <div className="w-1 h-9 bg-brand-green-glow rounded-full animate-pulse delay-75"></div>
                <div className="w-1 h-7 bg-brand-green-glow rounded-full animate-pulse delay-150"></div>
                <div className="w-1 h-9 bg-brand-green-glow rounded-full animate-pulse delay-200"></div>
                <div className="w-1 h-5 bg-brand-green-glow rounded-full animate-pulse delay-300"></div>
              </div>
            </div>

            {/* App Mockup Bottom Mic */}
            <div className="flex justify-center pb-2">
              <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/20 text-white animate-pulse">
                <Volume2 size={20} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Story Carousel */}
      <section className="py-12 bg-brand-dark-light border-y border-brand-dark-border overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 text-center space-y-6">
          <p className="text-gray-400 text-xs uppercase font-bold tracking-wider">Cenários Praticados Diariamente Pelos Alunos</p>
          
          <div className="flex justify-center items-center gap-8 flex-wrap">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-brand-green to-brand-green-glow">
                <div className="w-full h-full bg-brand-dark rounded-full flex items-center justify-center text-xs font-bold text-white">PT/EN</div>
              </div>
              <span className="text-[10px] text-gray-300 font-semibold">@dev_junior</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-brand-green to-brand-green-glow">
                <div className="w-full h-full bg-brand-dark rounded-full flex items-center justify-center text-xs font-bold text-white">JFK</div>
              </div>
              <span className="text-[10px] text-gray-300 font-semibold">@turista_ana</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-brand-green to-brand-green-glow">
                <div className="w-full h-full bg-brand-dark rounded-full flex items-center justify-center text-xs font-bold text-white">ZOOM</div>
              </div>
              <span className="text-[10px] text-gray-300 font-semibold">@tech_mariana</span>
            </div>
          </div>
        </div>
      </section>

      {/* Surreal Features Section */}
      <section className="py-20 px-6 max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-3">
          <span className="sec-lbl text-xs text-brand-green-glow uppercase font-bold tracking-wider">Por que o Liam é diferente?</span>
          <h2 className="text-3xl md:text-5xl font-serif font-bold text-white">Pratique o inglês real sem medo de julgamentos</h2>
          <p className="text-gray-400 text-sm max-w-xl mx-auto font-medium">
            Esqueça cursos que te obrigam a preencher lacunas de gramática. No Liam você treina conversando de verdade.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Feature 1 */}
          <div className="p-6 bg-brand-dark-light border border-brand-dark-border rounded-3xl hover:border-brand-green/30 transition-all group space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green-glow group-hover:bg-brand-green/20 transition-all">
              <Volume2 size={24} />
            </div>
            <h3 className="text-xl font-bold text-white">Modo Live por Voz</h3>
            <p className="text-gray-400 text-sm leading-relaxed font-medium">
              Converse de forma síncrona com a nossa IA ultra-rápida. Respostas em áudio natural com sotaque nativo americano (voz confiante e amigável), simulando dinâmicas reais.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 bg-brand-dark-light border border-brand-dark-border rounded-3xl hover:border-brand-green/30 transition-all group space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green-glow group-hover:bg-brand-green/20 transition-all">
              <ShieldAlert size={24} />
            </div>
            <h3 className="text-xl font-bold text-white">Avaliação Fonética Profissional</h3>
            <p className="text-gray-400 text-sm leading-relaxed font-medium">
              O Liam detecta sotaques amadores (ex: som de 'i' no final de palavras) e explica em português como realizar o movimento correto da boca e da língua (som do 'TH', conectados, etc.).
            </p>
          </div>

          {/* Feature 3 (The highlighted custom plans via Chat!) */}
          <div className="p-6 bg-brand-dark-light border border-brand-green/30 rounded-3xl hover:border-brand-green/60 transition-all group space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-brand-green/20 border-b border-l border-brand-green/30 text-brand-green-glow text-[9px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
              Destaque
            </div>
            <div className="w-12 h-12 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green-glow group-hover:bg-brand-green/20 transition-all">
              <MessageSquare size={24} />
            </div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Planos Criados Via Chat <span className="text-[10px] py-0.5 px-2 bg-brand-green/20 rounded font-bold border border-brand-green-glow/20">NOVO!</span>
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed font-medium">
              Converse em texto no Chat do Liam e peça qualquer cenário: *'Cria um plano para entrevista na Vercel'* ou *'Imigração no aeroporto de Londres'*. O Liam gera o plano com 3 etapas e sincroniza instantaneamente no seu Modo Live!
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-6 bg-brand-dark-light border border-brand-dark-border rounded-3xl hover:border-brand-green/30 transition-all group space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green-glow group-hover:bg-brand-green/20 transition-all">
              <Gauge size={24} />
            </div>
            <h3 className="text-xl font-bold text-white">Controle de Velocidade</h3>
            <p className="text-gray-400 text-sm leading-relaxed font-medium">
              Tem dificuldades por ser iniciante? Reduza a fala da IA para **0.8x** no cabeçalho e entenda cada fonema. Se já for avançado, aumente o ritmo para **1.2x** e treine para o nível máximo.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing-section" className="py-20 bg-brand-dark-light border-y border-brand-dark-border relative z-10 px-6">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="sec-lbl text-xs text-brand-green-glow uppercase font-bold tracking-wider">Acesso Ilimitado</span>
            <h2 className="text-3xl md:text-5xl font-serif font-bold text-white">Escolha o seu plano de treino</h2>
            <p className="text-gray-400 text-sm font-medium">
              Fale inglês sem limites com a IA. Cancele quando quiser.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto items-stretch">
            {/* Monthly Plan */}
            <div className="bg-brand-dark border border-brand-dark-border rounded-3xl p-8 flex flex-col justify-between space-y-6 hover:border-brand-green/20 transition-all">
              <div className="space-y-2">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Plano Mensal</span>
                <h3 className="text-2xl font-bold text-white">Prática Flexível</h3>
                <p className="text-gray-400 text-xs font-medium">Ideal para experimentar o Liam no seu próprio ritmo.</p>
              </div>

              <div className="space-y-1">
                <p className="text-gray-400 text-xs font-medium">Apenas</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-serif font-bold text-white">R$ 49,90</span>
                  <span className="text-xs text-gray-400 font-semibold">/mês</span>
                </div>
              </div>

              <div className="border-t border-brand-dark-border pt-4">
                <ul className="space-y-2 text-xs text-gray-300 font-semibold">
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Acesso 100% ilimitado por voz</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Avaliação fonética profissional</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Criação de planos via Chat</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Sem taxa de cancelamento</li>
                </ul>
              </div>

              <a 
                href="https://liam-ai-english-buddy-845513948607.us-west1.run.app/"
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 bg-brand-dark-light border border-brand-dark-border text-center font-bold text-white rounded-2xl hover:bg-white/5 active:scale-95 transition-all text-sm block cursor-pointer"
              >
                Comprar Plano Mensal
              </a>
            </div>

            {/* Annual Plan (Hot & Highlighted) */}
            <div className="bg-brand-dark border-2 border-brand-green rounded-3xl p-8 flex flex-col justify-between space-y-6 relative hover:border-brand-green-glow transition-all shadow-xl shadow-brand-green/5">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-green text-brand-dark text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-widest shadow-md">
                MELHOR OPÇÃO (ECONOMIZE 20%)
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-xs text-brand-green-glow font-bold uppercase tracking-wider">Plano Anual</span>
                <h3 className="text-2xl font-bold text-white">Fluência Acelerada</h3>
                <p className="text-gray-400 text-xs font-medium">Para quem está comprometido em destravar a carreira em dólares.</p>
              </div>

              <div className="space-y-1">
                <p className="text-gray-400 text-xs font-medium">Equivalente a R$ 39,90/mês</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-serif font-bold text-white">12x de R$ 39,90</span>
                </div>
                <p className="text-[10px] text-gray-500 font-semibold">Ou R$ 478,80 à vista. Economia de R$ 120,00/ano.</p>
              </div>

              <div className="border-t border-brand-dark-border pt-4">
                <ul className="space-y-2 text-xs text-gray-300 font-semibold">
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Acesso 100% ilimitado por voz</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Avaliação fonética profissional</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Criação de planos via Chat</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-brand-green-glow" /> Suporte prioritário via WhatsApp</li>
                </ul>
              </div>

              <a 
                href="https://liam-ai-english-buddy-845513948607.us-west1.run.app/"
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 bg-brand-green text-brand-dark text-center font-bold rounded-2xl hover:brightness-110 active:scale-95 transition-all text-sm block cursor-pointer glow-green shadow-lg shadow-brand-green/20"
              >
                Comprar Plano Anual
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Access Form Section */}
      <section id="login-form-section" className="py-20 px-6 max-w-md mx-auto text-center space-y-6 relative z-10">
        <div className="bg-brand-dark-light rounded-3xl shadow-2xl overflow-hidden border border-brand-dark-border">
          <div className="p-8 pb-6 bg-brand-dark flex flex-col items-center justify-center text-center border-b border-brand-dark-border">
            <div className="mx-auto w-14 h-14 bg-brand-dark-light border border-brand-dark-border rounded-2xl flex items-center justify-center mb-4 p-2 shadow-inner">
              <LogoIcon className="w-full h-full text-brand-green" />
            </div>
            <h2 className="text-2xl font-bold font-serif text-white mb-1 tracking-tight">Entre no LIAM</h2>
            <p className="text-gray-400 text-xs font-semibold">
              Digite o e-mail usado na sua compra ou cadastro.
            </p>
          </div>

          <div className="p-8 space-y-6 text-left">
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3.5 bg-red-500/10 text-red-400 rounded-xl text-xs font-semibold border border-red-500/20 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full pl-11 pr-4 py-3.5 bg-brand-dark border-2 border-brand-dark-border text-white rounded-2xl focus:ring-2 focus:ring-brand-green-glow focus:border-brand-green-glow outline-none transition-all placeholder:text-gray-500 text-xs font-medium"
                  placeholder="Ex: seuemail@exemplo.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-brand-green-glow text-white font-bold py-3.5 rounded-2xl hover:brightness-110 transition-all shadow-lg shadow-brand-green-glow/20 disabled:opacity-50 cursor-pointer text-xs flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : 'Entrar no LIAM'}
              </button>
            </form>

            <div className="text-center">
              <button
                onClick={() => setShowNoAccessModal(true)}
                className="text-gray-400 hover:text-brand-green-glow text-[11px] font-semibold hover:underline bg-transparent border-none cursor-pointer outline-none transition block mx-auto"
              >
                Ainda não tenho acesso
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostic Link for Support */}
        <div className="pt-4">
          <button
            onClick={() => setShowDiagnosticModal(true)}
            className="text-gray-600 hover:text-gray-400 text-[10px] font-mono hover:underline bg-transparent border-none cursor-pointer outline-none"
          >
            Acessar painel de diagnóstico
          </button>
        </div>
      </section>

      {/* Modal 1: Ainda não tenho acesso (Acesse o LIAM) */}
      {showNoAccessModal && (
        <div id="no-access-modal" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark-light border border-brand-dark-border rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl animate-fade-in">
            <div className="w-12 h-12 bg-brand-green/20 text-brand-green-glow rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-green/30">
              <HelpCircle size={24} />
            </div>
            <h3 className="text-2xl font-bold font-serif text-brand-text mb-3">Acesse o LIAM</h3>
            <p className="text-gray-400 mb-6 text-xs leading-relaxed font-medium">
              Para entrar no LIAM, você precisa ter uma assinatura ativa. Clique abaixo para adquirir seu acesso.
            </p>
            <button
              onClick={() => {
                setShowNoAccessModal(false);
                scrollToSection('pricing-section');
              }}
              className="w-full bg-brand-green-glow text-white font-bold py-3.5 px-4 rounded-xl hover:brightness-110 transition-all mb-3 block text-center shadow-lg shadow-brand-green-glow/20 text-sm cursor-pointer"
            >
              Ver Planos do LIAM
            </button>
            <button
              onClick={() => setShowNoAccessModal(false)}
              className="w-full bg-brand-dark border border-brand-dark-border text-gray-400 hover:text-brand-text font-bold py-3.5 px-4 rounded-xl hover:bg-brand-dark-border transition-all block cursor-pointer text-sm"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: E-mail não encontrado */}
      {showNotFoundModal && (
        <div id="not-found-modal" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-brand-dark-light border border-brand-dark-border rounded-3xl p-8 max-w-sm w-full text-center relative shadow-2xl animate-fade-in">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-2xl font-bold font-serif text-brand-text mb-3">E-mail não encontrado</h3>
            <p className="text-gray-400 mb-6 text-xs leading-relaxed font-medium">
              {error || "Não encontramos uma compra ativa vinculada exatamente a este e-mail. Verifique se digitou corretamente ou compre o acesso ao LIAM."}
            </p>
            <button
              onClick={() => {
                setShowNotFoundModal(false);
                scrollToSection('pricing-section');
              }}
              className="w-full bg-brand-green-glow text-white font-bold py-3.5 px-4 rounded-xl hover:brightness-110 transition-all mb-3 block text-center shadow-lg shadow-brand-green-glow/20 text-sm cursor-pointer"
            >
              Comprar acesso ao LIAM
            </button>
            <button
              onClick={() => setShowNotFoundModal(false)}
              className="w-full bg-brand-dark border border-brand-dark-border text-gray-400 hover:text-brand-text font-bold py-3.5 px-4 rounded-xl hover:bg-brand-dark-border transition-all block cursor-pointer text-sm"
            >
              Tentar outro e-mail
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Diagnóstico da Integração Cakto */}
      {showDiagnosticModal && (
        <div id="diagnostic-modal" className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-brand-dark-light border border-brand-dark-border rounded-3xl p-8 max-w-xl w-full relative shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto text-left">
            <h3 className="text-xl font-bold font-serif text-brand-text mb-2 flex items-center gap-2">
              🛠️ Diagnóstico da Integração Cakto
            </h3>
            <p className="text-gray-400 text-xs mb-6 font-medium">
              Use esta ferramenta para testar as credenciais OAuth e as APIs públicas da Cakto sem alterar nenhum dado de produção.
            </p>

            {/* Health Status */}
            <div className="mb-6 p-4 bg-brand-dark rounded-2xl border border-brand-dark-border">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Status da API Geral:</h4>
              {isHealthLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <div className="w-3 h-3 border-2 border-brand-green-glow border-t-transparent rounded-full animate-spin" />
                  <span>Gerando OAuth Token e testando endpoint /orders...</span>
                </div>
              ) : healthStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${healthStatus.ok ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-sm font-bold text-brand-text">
                      {healthStatus.ok ? 'Cakto Conectado (200 OK)' : 'Falha na Conexão'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 space-y-1 bg-black/20 p-2.5 rounded-lg font-mono">
                    <div>Token Gerado: <span className={healthStatus.tokenGenerated ? 'text-green-400' : 'text-red-400'}>{String(healthStatus.tokenGenerated)}</span></div>
                    {healthStatus.methodUsed && <div>Método OAuth: <span className="text-blue-400">{healthStatus.methodUsed}</span></div>}
                    {healthStatus.endpointMatched && <div>Endpoint Usado: <span className="text-blue-400">{healthStatus.endpointMatched}</span></div>}
                    {healthStatus.message && (
                      <div className="text-red-400 mt-2 truncate max-w-full overflow-hidden" title={healthStatus.message}>
                        Erro: {healthStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={checkHealth}
                  className="px-3 py-1.5 bg-brand-dark-border text-xs text-brand-text rounded-lg hover:bg-brand-dark hover:text-brand-green-glow transition-colors cursor-pointer"
                >
                  Executar Teste Geral
                </button>
              )}
            </div>

            {/* Test Specific Email */}
            <div className="p-4 bg-brand-dark rounded-2xl border border-brand-dark-border mb-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Testar E-mail Individual:</h4>
              <form onSubmit={handleTestEmailInCakto} className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Ex: cliente@gmail.com"
                  className="flex-1 px-3 py-2 bg-brand-dark-light border border-brand-dark-border text-brand-text rounded-xl text-xs outline-none focus:border-brand-green-glow"
                  required
                />
                <button
                  type="submit"
                  disabled={isTestLoading}
                  className="px-4 py-2 bg-brand-green-glow text-white text-xs font-bold rounded-xl hover:brightness-110 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isTestLoading ? 'Buscando...' : 'Pesquisar'}
                </button>
              </form>

              {testResult && (
                <div className="space-y-3 bg-black/20 p-3 rounded-xl font-mono text-xs max-h-[180px] overflow-y-auto">
                  <div className="flex justify-between items-center pb-2 border-b border-brand-dark-border">
                    <span className="text-gray-400">Registro na Cakto:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${testResult.recordFound ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {testResult.recordFound ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}
                    </span>
                  </div>

                  <div>E-mail Buscado: <span className="text-brand-text">{testResult.email}</span></div>
                  {testResult.targetProductId && <div>Filtro ID: <span className="text-yellow-400">{testResult.targetProductId}</span></div>}
                  {testResult.targetProductName && <div>Filtro Nome: <span className="text-yellow-400">{testResult.targetProductName}</span></div>}
                  {testResult.error && <div className="text-red-400">Erro: {testResult.error}</div>}
                  
                  {testResult.diagnosticResults && (
                    <div className="mt-2 space-y-2 pt-2 border-t border-brand-dark-border">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">Histórico de endpoints consultados:</div>
                      {testResult.diagnosticResults.map((res: any, idx: number) => {
                        const pathName = res.url.split('/public_api/')[1] || res.url;
                        return (
                          <div key={idx} className="p-1 rounded bg-black/30 border border-brand-dark-border text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-blue-400 truncate max-w-[170px] inline-block">{pathName}</span>
                              <span className={res.status === 200 ? 'text-green-400' : 'text-red-400'}>
                                HTTP {res.status || 'ERR'}
                              </span>
                            </div>
                            {res.success && res.recordsFoundCount !== undefined && (
                              <div className="text-[10px] text-gray-400">
                                Encontrados: {res.recordsFoundCount} registro(s) {res.matchingRecords && res.matchingRecords.length > 0 && `(Válidos filtrados: ${res.matchingRecords.filter((m: any) => m.isValidToUnlock).length})`}
                              </div>
                            )}
                            {res.error && (
                              <div className="text-[10px] text-red-500 truncate">{res.error}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowDiagnosticModal(false)}
              className="w-full bg-brand-dark border border-brand-dark-border text-gray-400 hover:text-brand-text font-bold py-3 px-4 rounded-xl hover:bg-brand-dark-border transition-colors block text-center cursor-pointer text-sm"
            >
              Fechar Painel de Diagnóstico
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
