import { Outlet, Navigate, useLocation, Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { LayoutDashboard, MessageCircle, Mic, Trophy, LogOut, User, Download } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { Logo, LogoIcon } from './ui/Logo';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function Layout() {
  const { profile } = useStore();
  const location = useLocation();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const { isInstallable, installPWA, isIOS } = usePWAInstall();
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  if (!profile?.level && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" />;
  }

  if (profile?.level && location.pathname === '/onboarding') {
    return <Navigate to="/" />;
  }

  const handleLogout = () => {
    signOut(auth);
  };

  const navItems = [
    { name: 'Home', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Chat', path: '/chat', icon: <MessageCircle size={20} /> },
    { name: 'Live', path: '/live', icon: <Mic size={20} /> },
    { name: 'Rank', path: '/leaderboard', icon: <Trophy size={20} /> },
    { name: 'Perfil', path: '/profile', icon: <User size={20} /> },
  ];

  return (
    <div translate="no" className={`notranslate h-[100dvh] bg-brand-dark flex flex-col md:flex-row text-brand-text font-sans ${isKeyboardOpen ? 'pb-0' : 'pb-16'} md:pb-0 overflow-hidden`}>
      {/* Mobile Nav - Bottom Bar */}
      {isInstallable && !showIosPrompt && (
        <div className="md:hidden fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top-4 fade-in">
          <div className="bg-brand-dark-light border border-brand-green/30 shadow-lg shadow-brand-green/10 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
               <div className="w-10 h-10 bg-brand-dark rounded-xl flex items-center justify-center p-2 border border-brand-dark-border">
                  <LogoIcon className="w-full h-full text-brand-green" />
               </div>
               <div>
                 <p className="text-sm font-bold text-brand-text">Instalar Liam</p>
                 <p className="text-xs text-gray-400">Adicionar à tela inicial</p>
               </div>
            </div>
            <button
              onClick={() => {
                if (isIOS) {
                  setShowIosPrompt(true);
                } else {
                  installPWA();
                }
              }}
              className="bg-brand-green-glow text-brand-dark px-4 py-2 rounded-xl text-xs font-bold hover:brightness-110"
            >
              Instalar
            </button>
          </div>
        </div>
      )}

      {/* iOS Install Prompt Modal */}
      {showIosPrompt && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4">
          <div className="bg-brand-dark-light border border-brand-dark-border rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <h3 className="text-xl font-bold text-brand-text mb-4">Instalar no iOS</h3>
            <p className="text-gray-400 text-sm mb-6">
              Para instalar o Liam no seu iPhone ou iPad:
            </p>
            <ol className="text-sm text-gray-300 space-y-4 mb-6 list-decimal list-inside">
              <li>Toque no botão <span className="inline-block bg-brand-dark p-1 rounded border border-brand-dark-border mx-1">Compartilhar</span> na barra do Safari.</li>
              <li>Role para baixo e selecione <span className="font-bold text-brand-green-glow">Adicionar à Tela de Início</span>.</li>
              <li>Toque em <span className="font-bold text-brand-text">Adicionar</span> no canto superior direito.</li>
            </ol>
            <button
              onClick={() => setShowIosPrompt(false)}
              className="w-full bg-brand-dark border border-brand-dark-border text-brand-text py-3 rounded-xl font-bold hover:bg-white/5 transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      <nav translate="no" className={`notranslate fixed bottom-0 w-full bg-brand-dark-light border-t border-brand-dark-border md:hidden z-50 transition-transform duration-200 ${isKeyboardOpen ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                location.pathname === item.path ? 'text-brand-green-glow' : 'text-gray-400'
              }`}
            >
              {item.icon}
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Desktop Nav - Sidebar */}
      <nav className="hidden md:flex flex-col w-64 bg-brand-dark-light border-r border-brand-dark-border h-[100dvh] fixed">
        <div className="p-6">
          <Logo />
        </div>
        <div className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                location.pathname === item.path
                  ? 'bg-brand-green/20 text-brand-green-glow font-medium'
                  : 'text-gray-400 hover:bg-brand-dark hover:text-white'
              }`}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-brand-dark-border space-y-2">
          {isInstallable && (
            <button
              onClick={() => {
                if (isIOS) {
                  setShowIosPrompt(true);
                } else {
                  installPWA();
                }
              }}
              className="flex items-center space-x-3 px-4 py-3 text-brand-green-glow hover:text-white w-full rounded-xl hover:bg-brand-green/10 transition-colors"
            >
              <Download size={20} />
              <span>Instalar app</span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 text-gray-500 hover:text-red-500 w-full rounded-xl hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-64 h-full flex flex-col overflow-y-auto overflow-x-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
