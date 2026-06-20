import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface FoundVerification {
  docId: string;
  data: any;
  collectionName: string;
}

export async function verifyEmailInLiamDB(email: string): Promise<FoundVerification | null> {
  console.log(`[Login] Verificando banco atual do LIAM...`);
  
  const cleanEmail = email.trim().toLowerCase();
  
  // Specific block rule for incorrect email to prevent unauthorized local overrides or Firestore leaks
  if (cleanEmail === 'valdemirpriscila55@gmail.com') {
    console.warn(`[Login] E-mail bloqueado por regra de correspondência inválida com Cakto: ${cleanEmail}`);
    return null;
  }

  const collectionsToCheck = ['users', 'profiles', 'manualAccess'];

  // Check direct documents with ID equal to the email
  for (const colName of collectionsToCheck) {
    try {
      const docRef = doc(db, colName, cleanEmail);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() || {};
        const accessStatus = data.accessStatus || 'active';
        
        if (accessStatus === 'active') {
          console.log(`[Login] E-mail encontrado no ID da coleção '${colName}' com status ativo`);
          return {
            docId: cleanEmail,
            data: data,
            collectionName: colName
          };
        } else {
          console.log(`[Login] E-mail encontrado no ID da coleção '${colName}' mas está inativo (${accessStatus})`);
        }
      }
    } catch (err) {
      console.warn(`[Login] Erro ao buscar ID ${colName}/${cleanEmail}:`, err);
    }
  }

  return null;
}

export async function verifyEmailInCakto(email: string): Promise<boolean | string> {
  try {
    const response = await fetch('/api/login/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.authorized) {
        return true;
      }
      if (data.status === 'waiting_payment') {
        return 'waiting_payment';
      }
    }
  } catch (error) {
    console.error("[Login] Erro ao validar e-mail na Cakto:", error);
  }
  return false;
}
