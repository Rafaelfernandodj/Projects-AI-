import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { useStore, UserProfile } from './store/useStore';

// Page imports
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Onboarding from './pages/Onboarding';
import LiveMode from './pages/LiveMode';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Layout from './components/Layout';

export default function App() {
  const { setUser, setProfile, setLoading, user, loading } = useStore();

  useEffect(() => {
    // 1. Load custom persistent user session
    async function initSession() {
      setLoading(true);

      // AÇÃO 4: Clean up valdemirpriscila55@gmail.com from Firestore if it exists (mark blocked)
      const wrongEmailForBlock = 'valdemirpriscila55@gmail.com';
      Promise.all(
        ['users', 'profiles', 'manualAccess'].map(async (col) => {
          try {
            const wrongUserRef = doc(db, col, wrongEmailForBlock);
            const wrongSnap = await getDoc(wrongUserRef);
            if (wrongSnap.exists() && wrongSnap.data().accessStatus !== 'blocked') {
              console.log(`[Firestore Cleanup] Atualizando ${col}/${wrongEmailForBlock} para status bloqueado (accessStatus: blocked)...`);
              await setDoc(wrongUserRef, {
                ...wrongSnap.data(),
                accessStatus: 'blocked',
                blockedReason: 'email_mismatch_cakto_validation'
              });
              console.log(`[Firestore Cleanup] ${col}/${wrongEmailForBlock} marcado como bloqueado no Firestore com sucesso.`);
            }
          } catch (err) {
            console.error(`[Firestore Cleanup] Erro ao limpar ${col}/${wrongEmailForBlock}:`, err);
          }
        })
      );

      // AÇÃO 1 & AÇÃO 2: Check if there's any active local session for valdemirpriscila55@gmail.com
      const sessionStr = localStorage.getItem('liam_user_session');

      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const currentEmail = String(session.email || '').trim().toLowerCase();
          
          if (currentEmail === 'valdemirpriscila55@gmail.com') {
            console.log(`[Session Cleanup] Detectada sessão indevida com email errado: ${currentEmail}`);
            // Force clear storage
            localStorage.removeItem('liam_user_session');
            sessionStorage.removeItem('liam_user_session');
            sessionStorage.removeItem('live_active_reload');
            // Store blocker flag to notify Login screen to pop up the blocked message
            localStorage.setItem('liam_blocked_wrong_email_msg', 'true');
            setUser(null);
            setProfile(null);
            setLoading(false);
            console.log('[Session Cleanup] Sessão indevida limpa com sucesso. Usuário redirecionado.');
            return;
          }
        } catch (e) {
          console.error("[Session Cleanup] Erro ao deserializar sessao:", e);
        }
      }

      // Clear session exactly once for this development transition to allow clean testing of login
      if (!localStorage.getItem('liam_session_cleanup_v2')) {
        localStorage.removeItem('liam_user_session');
        localStorage.setItem('liam_session_cleanup_v2', 'true');
        console.log('[Session] Sessão local limpa com sucesso para nova rodada de testes.');
      }

      const checkedSessionStr = localStorage.getItem('liam_user_session');

      if (checkedSessionStr) {
        try {
          const session = JSON.parse(checkedSessionStr);
          console.log(`[Session] Carregando sessão ativa para: ${session.email}`);
          
          setUser({ uid: session.userId, email: session.email } as any);
          
          // Get profile from Firestore
          const docRef = doc(db, 'users', session.userId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
            console.log(`[Session] Perfil recuperado de Firestore com sucesso.`);
          } else {
            console.log(`[Session] Perfil não encontrado no banco (${session.userId}), carregando perfil básico.`);
            setProfile({
              userId: session.userId,
              email: session.email,
              displayName: session.email.split('@')[0],
              level: undefined // Leads to onboarding
            } as any);
          }
        } catch (err) {
          console.error("[Session] Erro ao restaurar sessão:", err);
          localStorage.removeItem('liam_user_session');
          setUser(null);
          setProfile(null);
        }
      } else {
        console.log("[Session] Nenhuma sessão local encontrada.");
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    }

    initSession();

    // Diagnósticos PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    console.log("PWA diagnostic:");
    console.log("Service worker supported:", "serviceWorker" in navigator);
    console.log("isStandalone:", Boolean(isStandalone));
    console.log("reload prevention active:", true);
  }, [setUser, setProfile, setLoading]);

  if (loading) {
    const isRestoringLive = sessionStorage.getItem('live_active_reload');
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark text-brand-text">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-green-glow border-t-transparent rounded-full animate-spin" />
          <span>{isRestoringLive ? "Reconectando com o Liam..." : "Carregando liam..."}</span>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        <Route element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/live" element={<LiveMode />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}
