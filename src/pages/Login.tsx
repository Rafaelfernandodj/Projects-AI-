import { useState } from 'react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { Mail, Lock, User as UserIcon } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { LogoIcon } from '../components/ui/Logo';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      const res = await signInWithPopup(auth, googleProvider);
      
      // Check if user exists in Firestore
      const userRef = doc(db, 'users', res.user.uid);
      try {
          const docSnap = await Promise.race([getDoc(userRef), new Promise<any>((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
          
          if (!docSnap.exists()) {
              // Create minimal profile so app doesn't break
              const setPromise = setDoc(userRef, {
                 userId: res.user.uid,
                 email: res.user.email,
                 displayName: res.user.displayName || 'Aluno',
                 loginType: 'google',
                 createdAt: new Date().toISOString()
              });
              await Promise.race([setPromise, new Promise((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
          }
      } catch(err: any) {
          console.warn("Could not fetch/save user profile immediately (offline/timeout):", err);
          // Don't throw, let them in natively if Auth succeeded!
      }
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/operation-not-allowed') {
            setError('O login por Google não está ativado no Firebase Console do seu projeto.');
        } else {
            setError(err.message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!name.trim()) throw new Error('Please enter your full name');
        const res = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save user profile immediately to Firestore
        try {
            const setPromise = setDoc(doc(db, 'users', res.user.uid), {
                 userId: res.user.uid,
                 email: res.user.email,
                 displayName: name,
                 loginType: 'email',
                 createdAt: new Date().toISOString()
            });
            await Promise.race([setPromise, new Promise((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
        } catch(err: any) {
            console.warn("Could not save initial email profile immediately:", err);
        }
      }
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
           case 'auth/email-already-in-use':
             setError('Este email já está cadastrado.');
             break;
           case 'auth/weak-password':
             setError('A senha deve ter pelo menos 6 caracteres.');
             break;
           case 'auth/invalid-credential':
             setError('Email ou senha inválidos.');
             break;
           case 'auth/operation-not-allowed':
             setError('O login por Email/Senha não está ativado no Firebase Console do seu projeto.');
             break;
           default:
             setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4">
      <div className="max-w-md w-full bg-brand-dark-light rounded-3xl shadow-xl overflow-hidden border border-brand-dark-border">
        <div className="p-8 pb-6 bg-brand-dark flex flex-col items-center justify-center text-center border-b border-brand-dark-border">
          <div className="mx-auto w-16 h-16 bg-brand-dark-light border border-brand-dark-border rounded-full flex items-center justify-center mb-4 p-2">
            <LogoIcon className="w-full h-full text-brand-green" />
          </div>
          <h2 className="text-3xl font-bold mb-2 font-serif text-brand-text">Meet Liam.</h2>
          <p className="text-brand-green">Your AI English Buddy.</p>
        </div>

        <div className="p-8">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center space-x-3 bg-brand-dark border-2 border-brand-dark-border text-brand-text py-3 rounded-xl font-medium hover:bg-brand-dark-border transition-colors mb-6 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>{isLoading ? 'Conectando...' : 'Continue com Google'}</span>
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
               <div className="w-full border-t border-brand-dark-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
               <span className="px-2 bg-brand-dark-light text-gray-400">Ou use seu email</span>
            </div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {error && <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm font-medium border border-red-500/20">{error}</div>}
            
            {!isLogin && (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                  <UserIcon size={20} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-brand-dark border-2 border-brand-dark-border text-brand-text rounded-xl focus:ring-2 focus:ring-brand-green-glow focus:border-brand-green-glow outline-none transition-all placeholder:text-gray-500"
                  placeholder="Nome Completo"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <Mail size={20} />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-brand-dark border-2 border-brand-dark-border text-brand-text rounded-xl focus:ring-2 focus:ring-brand-green-glow focus:border-brand-green-glow outline-none transition-all placeholder:text-gray-500"
                placeholder="Email address"
                required
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <Lock size={20} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-brand-dark border-2 border-brand-dark-border text-brand-text rounded-xl focus:ring-2 focus:ring-brand-green-glow focus:border-brand-green-glow outline-none transition-all placeholder:text-gray-500"
                placeholder="Password"
                required
              />
            </div>

            <button
               type="submit"
               disabled={isLoading}
               className="w-full bg-brand-green-glow text-white font-medium py-3 rounded-xl hover:brightness-110 transition-colors disabled:opacity-50"
            >
               {isLoading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-400">
            {isLogin ? "Não tem conta? " : "Já possui conta? "}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-brand-green-glow font-semibold hover:underline"
            >
              {isLogin ? 'Criar Usuário' : 'Fazer Login'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
