import { useStore } from '../store/useStore';
import { Flame, Trophy, Route, Clock, ChevronRight, Download, MousePointer2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useState } from 'react';

export default function Dashboard() {
  const { profile } = useStore();
  const { isInstallable, isInstalled, installPWA, isIOS } = usePWAInstall();
  const [showIosTip, setShowIosTip] = useState(false);
  const isInIframe = window.self !== window.top;

  // Check if it's Safari on iOS
  const isSafari = /safari/.test(navigator.userAgent.toLowerCase()) && !/chrome|crios|fxios|opera|opios/.test(navigator.userAgent.toLowerCase());
  const isIosButNotSafari = isIOS && !isSafari;

  if (!profile) return null;
  if (!profile.level) return <Navigate to="/onboarding" />;

  if ((profile.level as string) === 'Error') {
    return (
      <div translate="no" className="notranslate p-6 md:p-10 max-w-xl mx-auto space-y-6 text-center mt-10">
        <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
          <Flame size={40} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-brand-text">Configuração do Firebase Pendente</h2>
        <p className="text-gray-400">
          Ocorreu um erro ao conectar com o banco de dados. Para resolver:
        </p>
        <div className="bg-brand-dark p-6 rounded-2xl border border-brand-dark-border text-left space-y-4 text-sm text-gray-300">
          <p>1. Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-brand-green-glow hover:underline font-bold">Firebase Console</a></p>
          <p>2. Entre no projeto <strong>liam-ai-english</strong></p>
          <p>3. No menu lateral, expanda a seção "Build" e clique em <strong>Firestore Database</strong></p>
          <p>4. Se ainda não criou, clique em <strong>Create database</strong> (pode deixar as opções de localização padrão e depois em production mode ou test mode)</p>
          <p>5. Após o banco ser criado, vá na aba <strong>Rules</strong> e substitua o texto por:</p>
          <pre className="bg-black/50 p-4 rounded-xl border border-brand-dark-border overflow-x-auto text-[11px] text-brand-green">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`}
          </pre>
          <p>6. Clique em <strong>Publish</strong>.</p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="w-full bg-brand-green-glow text-brand-dark px-4 py-3 rounded-xl font-bold hover:brightness-110"
        >
          Já configurei, recarregar página
        </button>
      </div>
    );
  }

  return (
    <div translate="no" className="notranslate p-6 md:p-10 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-text">
            What's up, {profile.displayName || 'Buddy'}! 👋
          </h1>
          <p className="text-brand-green mt-1">Ready for your real-life English practice today?</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-brand-dark-light px-4 py-2 rounded-xl border border-brand-dark-border">
            <Flame className="text-orange-500 fill-orange-500" size={24} />
            <div>
              <div className="text-lg font-bold text-brand-text leading-none">{profile.streak}</div>
              <div className="text-[10px] uppercase font-bold text-orange-500">Day Streak</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-brand-dark-light px-4 py-2 rounded-xl border border-brand-dark-border">
            <Trophy className="text-brand-green-glow" size={24} />
            <div>
              <div className="text-lg font-bold text-brand-green-glow leading-none">{profile.points}</div>
              <div className="text-[10px] uppercase font-bold text-brand-green">Points</div>
            </div>
          </div>
        </div>
      </div>

      {/* Level Card */}
      {!isInstalled && (
        <div className="bg-brand-green/10 border border-brand-green/30 rounded-2xl p-4 flex flex-col items-stretch gap-4 animate-in slide-in-from-top-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="p-2 bg-brand-green/20 rounded-lg text-brand-green-glow">
                  <Download size={20} />
               </div>
               <div>
                 <p className="font-bold text-brand-text">Baixe o Liam no seu celular!</p>
                 <p className="text-xs text-gray-400">Tenha o Liam na tela inicial como APP nativo.</p>
               </div>
            </div>
            {isInIframe ? (
              <a 
                href={window.location.href} 
                target="_blank" 
                rel="noreferrer"
                className="w-full sm:w-auto bg-brand-green-glow text-brand-dark px-4 py-2 rounded-xl text-sm font-bold hover:brightness-110 flex items-center justify-center gap-2"
              >
                Abrir APP Completo
              </a>
            ) : (
              <button 
                onClick={() => {
                  if (isIOS) setShowIosTip(!showIosTip);
                  else if (isInstallable) installPWA();
                }}
                className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${(!isIOS && !isInstallable) ? 'bg-gray-700 text-gray-300 opacity-50 cursor-not-allowed' : 'bg-brand-green-glow text-brand-dark hover:brightness-110'}`}
              >
                {isIOS ? 'Como instalar?' : (isInstallable ? 'Instalar Agora' : 'Leia a dica abaixo 👇')}
              </button>
            )}
          </div>

          {isInIframe && (
            <div className="bg-blue-500/20 border border-blue-500/30 p-3 rounded-xl text-[11px] text-blue-200">
              <p className="font-bold mb-1">💡 Passo 1: Abra em uma nova aba</p>
              <p>O navegador de pré-visualização bloqueia a instalação. Clique no botão acima para abrir na tela real.</p>
            </div>
          )}

          {!isInIframe && isIosButNotSafari && (
            <div className="bg-orange-500/20 border border-orange-500/30 p-3 rounded-xl text-[11px] text-orange-200">
              <p className="font-bold mb-1">⚠️ Atenção:</p>
              <p>No iPhone/iPad, a instalação só funciona pelo navegador <strong>Safari</strong>. Se estiver no Chrome ou outro, abra no Safari para instalar.</p>
            </div>
          )}
          
          {!isInIframe && !isIOS && !isInstallable && (
            <div className="bg-orange-500/20 border border-orange-500/30 p-3 rounded-xl text-[11px] text-orange-200">
              <p className="font-bold mb-1">💡 Dica:</p>
              <p>Toque no ícone de "Relógio com Seta" ou nos três pontinhos do navegador e selecione <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</p>
            </div>
          )}
        </div>
      )}

      {showIosTip && (
        <div className="bg-brand-dark-light border border-brand-dark-border p-4 rounded-xl text-sm text-gray-300 space-y-2 animate-in fade-in">
           <p className="font-bold text-brand-green-glow">Como baixar o Liam no iPhone:</p>
           <p className="flex items-center gap-2">1. Toque no ícone de <span className="bg-brand-dark px-2 py-1 rounded border border-brand-dark-border text-xs">Compartilhar</span> (quadrado com seta pra cima) no Safari.</p>
           <p>2. Role a lista para baixo e toque em <span className="text-brand-green-glow font-bold underline">Adicionar à Tela de Início</span>.</p>
           <p>3. Toque em <span className="font-bold text-brand-text">Adicionar</span> no topo da tela.</p>
        </div>
      )}

      <div className="bg-brand-dark-light border border-brand-green/30 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 -m-8 opacity-5 text-brand-green-glow">
          <Trophy size={200} />
        </div>
        <div className="relative z-10">
          <div className="text-brand-green uppercase tracking-wider text-sm font-semibold mb-1">Your Level</div>
          <h2 className="text-4xl font-black mb-4 text-brand-text">{profile.level}</h2>
          <p className="text-gray-300 max-w-sm mb-6">
            {profile.level === 'Survivor' && "We're going to break the fear of speaking. Let's communicate in real-life contexts."}
            {profile.level === 'Speaker' && "You're doing great! Our focus now is correcting nuances and gaining fluency."}
            {profile.level === 'Fluent' && "Time to refine! We'll use 100% English with complex real-world situations."}
          </p>
          <div className="flex gap-3">
            <Link to="/live" className="bg-brand-green-glow text-brand-dark px-6 py-2.5 rounded-xl font-bold hover:brightness-110 transition flex items-center gap-2">
              Start Live <ChevronRight size={18} />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-brand-dark-light p-6 rounded-3xl border border-brand-dark-border shadow-sm md:col-span-1">
          <h3 className="font-bold text-brand-text mb-4 flex items-center gap-2">
             Profile Focus
          </h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-400">Goal</div>
              <div className="font-medium text-brand-green">{profile.goal || 'Learn English'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Main Difficulty</div>
              <div className="font-medium text-brand-green">{profile.difficulties || 'None identified'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">School</div>
              <div className="font-medium text-brand-green">{profile.schoolName || 'Global'}</div>
            </div>
          </div>
        </div>

        <div className="bg-brand-dark-light p-6 rounded-3xl border border-brand-dark-border shadow-sm md:col-span-2">
          <h3 className="font-bold text-brand-text mb-4">Medals & Achievements</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Example Badges */}
            <div className="flex flex-col items-center justify-center p-4 bg-brand-dark rounded-2xl border border-brand-dark-border text-center">
               <div className="w-12 h-12 bg-brand-dark-light text-orange-500 rounded-full flex items-center justify-center mb-2 shadow-sm border border-brand-dark-border">
                  <Flame size={20} className="fill-orange-500" />
               </div>
               <div className="text-xs font-bold text-brand-text">Primeiro passo</div>
               <div className="text-[10px] text-gray-500">Iniciou na plataforma</div>
            </div>

            <div className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center ${profile.streak >= 7 ? 'bg-brand-dark border-brand-green/30' : 'bg-brand-dark-light border-brand-dark-border opacity-60'}`}>
               <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 shadow-sm border border-brand-dark-border ${profile.streak >= 7 ? 'bg-brand-dark-light text-brand-green-glow' : 'bg-brand-dark text-gray-500'}`}>
                  <Flame size={20} />
               </div>
               <div className={`text-xs font-bold ${profile.streak >= 7 ? 'text-brand-green-glow' : 'text-gray-500'}`}>7 dias seguidos</div>
               <div className={`text-[10px] ${profile.streak >= 7 ? 'text-brand-text' : 'text-gray-400'}`}>Estudou uma semana</div>
            </div>

            <div className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center ${profile.textSessions >= 50 ? 'bg-brand-dark border-brand-green/30' : 'bg-brand-dark-light border-brand-dark-border opacity-60'}`}>
               <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 shadow-sm border border-brand-dark-border ${profile.textSessions >= 50 ? 'bg-brand-dark-light text-brand-green-glow' : 'bg-brand-dark text-gray-500'}`}>
                  <Route size={20} />
               </div>
               <div className={`text-xs font-bold ${profile.textSessions >= 50 ? 'text-brand-green-glow' : 'text-gray-500'}`}>50 respostas</div>
               <div className={`text-[10px] ${profile.textSessions >= 50 ? 'text-brand-text' : 'text-gray-400'}`}>Falou bastante!</div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
