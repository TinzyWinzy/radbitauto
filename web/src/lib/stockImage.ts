// Re-encoding vehicle photos also removes embedded camera/GPS metadata.
export async function optimizeStockImage(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error('Choose JPEG, PNG or WebP photos under 20 MB');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) {
      throw new Error('Photo dimensions are too large. Choose a smaller photo.');
    }
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55]) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        result => result ? resolve(result) : reject(new Error('Could not compress photo')),
        'image/webp', quality,
      ));
      if (blob.size < 2 * 1024 * 1024 && ['image/webp', 'image/png', 'image/jpeg'].includes(blob.type)) return blob;
    }
    throw new Error('Photo is still too large after compression. Choose a smaller photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
