import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

/**
 * Uploads a base64 encoded audio file to Firebase Storage.
 * 
 * @param userId The ID of the user uploading the file.
 * @param fileId A unique identifier for the file (e.g., message ID).
 * @param base64Data The base64 string of the audio.
 * @param mimeType The mime type of the audio.
 * @returns The public download URL of the uploaded audio.
 */
export const uploadImageToStorage = async (
  userId: string,
  fileId: string,
  base64Data: string,
  mimeType: string
): Promise<string> => {
  try {
    const extension = mimeType.split('/')[1] || 'jpeg';
    const filePath = `users/${userId}/images/${fileId}.${extension}`;
    const storageRef = ref(storage, filePath);

    const dataUrl = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    
    await uploadString(storageRef, dataUrl, 'data_url');
    const downloadURL = await getDownloadURL(storageRef);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image to Storage:', error);
    throw error;
  }
};

export const uploadAudioToStorage = async (
  userId: string,
  fileId: string,
  base64Data: string,
  mimeType: string
): Promise<string> => {
  try {
    const extension = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'raw';
    const filePath = `users/${userId}/audio/${fileId}.${extension}`;
    const storageRef = ref(storage, filePath);

    // Format correctly for uploadString
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    await uploadString(storageRef, dataUrl, 'data_url');
    const downloadURL = await getDownloadURL(storageRef);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading audio to Storage:', error);
    throw error;
  }
};
