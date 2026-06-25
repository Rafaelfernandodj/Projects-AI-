import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { LogoIcon } from '../components/ui/Logo';
import { Mail, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4 relative overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-green/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full bg-brand-dark-light rounded-3xl shadow-2xl overflow-hidden border border-brand-dark-border animate-fade-in z-10">
        <div className="p-8 pb-6 bg-brand-dark flex flex-col items-center justify-center text-center border-b border-brand-dark-border">
          <div className="mx-auto w-16 h-16 bg-brand-dark-light border border-brand-dark-border rounded-2xl flex items-center justify-center mb-4 p-2 shadow-inner">
            <LogoIcon className="w-full h-full text-brand-green" />
          </div>
          <h2 className="text-2xl font-bold font-serif text-brand-text mb-1 tracking-tight">Entre no LIAM</h2>
          <p className="text-gray-400 text-sm">
            Digite o e-mail usado na sua compra ou cadastro.
          </p>
        </div>

        <div className="p-8 space-y-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3.5 bg-red-500/10 text-red-400 rounded-xl text-sm font-semibold border border-red-500/20 flex items-center gap-2">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                <Mail size={18} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3.5 bg-brand-dark border-2 border-brand-dark-border text-brand-text rounded-2xl focus:ring-2 focus:ring-brand-green-glow focus:border-brand-green-glow outline-none transition-all placeholder:text-gray-500 text-sm font-medium"
                placeholder="Ex: seuemail@exemplo.com"
                required
              />
            </div>

            <button
               type="submit"
               disabled={isLoading}
               className="w-full bg-brand-green-glow text-white font-bold py-3.5 rounded-2xl hover:brightness-110 transition-all shadow-lg shadow-brand-green-glow/20 disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
            >
               {isLoading ? (
                 <>
                   <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                   <span>Verificando...</span>
                 </>
               ) : 'Entrar no LIAM'}
            </button>
          </form>

          <div className="text-center space-y-2">
            <button
              onClick={() => setShowNoAccessModal(true)}
              className="text-gray-400 hover:text-brand-green-glow text-xs font-semibold hover:underline bg-transparent border-none cursor-pointer outline-none transition block mx-auto"
            >
              Ainda não tenho acesso
            </button>
          </div>
        </div>
      </div>

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
            <a
              href="https://liam-ai-english-buddy-845513948607.us-west1.run.app/"
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              className="w-full bg-brand-green-glow text-white font-bold py-3.5 px-4 rounded-xl hover:brightness-110 transition-all mb-3 block text-center shadow-lg shadow-brand-green-glow/20 text-sm"
            >
              Comprar acesso ao LIAM
            </a>
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
            <a
              href="https://liam-ai-english-buddy-845513948607.us-west1.run.app/"
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              className="w-full bg-brand-green-glow text-white font-bold py-3.5 px-4 rounded-xl hover:brightness-110 transition-all mb-3 block text-center shadow-lg shadow-brand-green-glow/20 text-sm"
            >
              Comprar acesso ao LIAM
            </a>
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
                <div className="flex items-center gap-2 text-sm text-gray-400">
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
