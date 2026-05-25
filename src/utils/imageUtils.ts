export const cropAndZoomImage = (
  base64Data: string,
  mimeType: string,
  zoomFactor: number = 1.5,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));

      const cropWidth = img.width / zoomFactor;
      const cropHeight = img.height / zoomFactor;
      const startX = (img.width - cropWidth) / 2;
      const startY = (img.height - cropHeight) / 2;

      canvas.width = cropWidth;
      canvas.height = cropHeight;
      ctx.drawImage(
        img,
        startX,
        startY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );

      const dataUrl = canvas.toDataURL(mimeType, 0.9);
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
};
