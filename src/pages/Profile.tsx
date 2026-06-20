import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { User, LogOut, CheckCircle, Edit2, Loader2 } from 'lucide-react';

export default function Profile() {
  const { profile, setProfile } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    fullName: '',
    schoolName: '',
    goal: '',
    difficulties: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (profile && (profile.level as string) !== 'Error') {
      setFormData({
        displayName: profile.displayName || '',
        fullName: profile.fullName || '',
        schoolName: profile.schoolName || '',
        goal: profile.goal || '',
        difficulties: profile.difficulties || ''
      });
    }
  }, [profile]);

  if (!profile) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setSuccessMsg('');
    try {
      const userRef = doc(db, 'users', profile.userId);
      const updates = {
        displayName: formData.displayName,
        fullName: formData.fullName,
        schoolName: formData.schoolName,
        goal: formData.goal,
        difficulties: formData.difficulties
      };
      
      const savePromise = updateDoc(userRef, updates);
      await Promise.race([savePromise, new Promise((_, reject) => setTimeout(() => reject('timeout'), 4000))]);
      
      setProfile({
          ...profile,
          ...updates
      });

      setSuccessMsg('Perfil atualizado com sucesso! (Salvo offline se sem rede)');
      setIsEditing(false);
    } catch (error: any) {
      if (error === 'timeout' || error.code === 'unavailable') {
         // App is offline, we save locally to state
         const updates = {
            displayName: formData.displayName,
            fullName: formData.fullName,
            schoolName: formData.schoolName,
            goal: formData.goal,
            difficulties: formData.difficulties
         };
         setProfile({
            ...profile,
            ...updates
         });
         setSuccessMsg('Perfil atualizado com sucesso! (Sincronizando em segundo plano)');
         setIsEditing(false);
      } else {
         console.error("Error updating profile", error);
         alert(`Erro ao salvar o perfil. (${error.message || error})`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div translate="no" className="notranslate p-6 md:p-10 max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500 pb-24">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-brand-green/20 text-brand-green-glow rounded-2xl flex items-center justify-center font-bold text-2xl shadow-sm border border-brand-green/30">
          <User size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-brand-text font-serif">Seu Perfil</h1>
          <p className="text-gray-400 font-medium">{profile.email}</p>
        </div>
      </div>

      <div className="bg-brand-dark-light rounded-3xl p-6 md:p-8 shadow-sm border border-brand-dark-border relative">
        
        <div className="flex justify-between items-center mb-6">
           <h2 className="text-xl font-bold text-brand-text">Informações Pessoais</h2>
           {!isEditing ? (
             <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-brand-green-glow font-bold hover:bg-brand-green/10 px-3 py-1.5 rounded-lg transition">
                 <Edit2 size={16} /> Editar
             </button>
           ) : (
             <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 text-gray-400 font-bold hover:bg-brand-dark px-3 py-1.5 rounded-lg transition">
                 Cancelar
             </button>
           )}
        </div>

        {successMsg && (
            <div className="mb-6 p-3 bg-brand-green/20 text-brand-green-glow rounded-xl flex items-center gap-2 font-medium border border-brand-green/30">
                <CheckCircle size={18} /> {successMsg}
            </div>
        )}

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-400 mb-1">Como quer ser chamado?</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.displayName} 
                onChange={e => setFormData({...formData, displayName: e.target.value})} 
                className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow" 
              />
            ) : (
              <div className="p-3 bg-brand-dark border border-brand-dark-border rounded-xl text-gray-300 font-medium">
                {profile.displayName || 'Não informado'}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-400 mb-1">Nome Completo</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.fullName} 
                onChange={e => setFormData({...formData, fullName: e.target.value})} 
                className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow" 
              />
            ) : (
              <div className="p-3 bg-brand-dark border border-brand-dark-border rounded-xl text-gray-300 font-medium">
                {profile.fullName || 'Não informado'}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-400 mb-1">Sua Escola Atual</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.schoolName} 
                onChange={e => setFormData({...formData, schoolName: e.target.value})} 
                className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow" 
              />
            ) : (
              <div className="p-3 bg-brand-dark border border-brand-dark-border rounded-xl text-gray-300 font-medium">
                {profile.schoolName || 'Não informado'}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-400 mb-1">Seu Maior Objetivo</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.goal} 
                onChange={e => setFormData({...formData, goal: e.target.value})} 
                className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow" 
              />
            ) : (
              <div className="p-3 bg-brand-dark border border-brand-dark-border rounded-xl text-gray-300 font-medium">
                {profile.goal || 'Não informado'}
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-400 mb-1">Maior Dificuldade</label>
            {isEditing ? (
              <input 
                type="text" 
                value={formData.difficulties} 
                onChange={e => setFormData({...formData, difficulties: e.target.value})} 
                className="w-full p-3 bg-brand-dark border border-brand-dark-border text-brand-text rounded-xl outline-none focus:ring-2 focus:ring-brand-green-glow" 
              />
            ) : (
              <div className="p-3 bg-brand-dark border border-brand-dark-border rounded-xl text-gray-300 font-medium">
                {profile.difficulties || 'Não informado'}
              </div>
            )}
          </div>

        {isEditing && (
            <button 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full mt-6 bg-brand-green-glow text-white py-3.5 rounded-xl font-bold hover:brightness-110 transition-colors flex items-center justify-center gap-2"
            >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Alterações'}
            </button>
        )}
      </div>

      {/* App Stats */}
      <div className="bg-brand-dark-light rounded-3xl p-6 border border-brand-dark-border mt-8">
        <h2 className="text-xl font-bold text-brand-text mb-4">Nível no App</h2>
        <div className="grid grid-cols-2 gap-4">
            <div className="bg-brand-dark p-4 rounded-2xl shadow-sm border border-brand-dark-border">
                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Level</div>
                <div className="text-2xl font-black text-brand-green-glow">{profile.level}</div>
            </div>
            <div className="bg-brand-dark p-4 rounded-2xl shadow-sm border border-brand-dark-border">
                <div className="text-sm font-bold text-gray-400 uppercase tracking-wider">Conta</div>
                <div className="text-xl font-bold text-orange-500 capitalize">{(profile as any).loginType || 'Email'}</div>
            </div>
        </div>
      </div>

      <button
         onClick={async () => {
           localStorage.removeItem('liam_user_session');
           try {
             await signOut(auth);
           } catch (e) {
             console.warn("Error signing out from Firebase Auth:", e);
           }
           window.location.reload();
         }}
         className="w-full flex items-center justify-center space-x-3 px-4 py-4 text-red-500 bg-red-500/10 border border-red-500/20 font-bold rounded-2xl hover:bg-red-500/20 transition-colors mt-8"
      >
         <LogOut size={20} />
         <span>Deslogar e Sair</span>
      </button>

    </div>
  );
}
