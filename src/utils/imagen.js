// Comprime una imagen (File) a un data URL JPEG, redimensionando a `maxDim` px por el lado
// más largo. Así las fotos del celular (que pesan varios MB) quedan en ~100–300 KB y NO
// rebasan el límite de payload del backend (5 MB) al guardarse dentro del registro JSON.
// Devuelve Promise<string> con el data URL, listo para guardar/mostrar en un <img src>.
export function comprimirImagen(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
