/** Side of the stored photo; large enough for the biggest avatar on screen at 2× density. */
export const AVATAR_SIDE = 256;

/** The centered square of an image: where to read from so nothing gets stretched. */
export function centerSquare(
  width: number,
  height: number,
): {
  x: number;
  y: number;
  side: number;
} {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/**
 * Turns any image the browser can decode into a 256 × 256 PNG cropped from the center. Drawing
 * it onto a canvas also drops EXIF data such as the GPS position phone photos carry.
 * @throws {Error} when the file isn't a decodable image.
 */
export async function toAvatarPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch((error: unknown) => {
    throw new Error('이 파일은 이미지로 열 수 없어요.', { cause: error });
  });
  const { x, y, side } = centerSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지를 줄이지 못했어요.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, x, y, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('이미지를 줄이지 못했어요.'));
    }, 'image/png');
  });
}
