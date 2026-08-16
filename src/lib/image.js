import * as ImageManipulator from 'expo-image-manipulator';

// Claude tops out at 2576 px on the long edge, and portion estimation does not get
// better past roughly a thousand pixels of plate. Shrinking here cuts the upload —
// which is the slowest part of the round trip on mobile data — and the image tokens.
const MAX_WIDTH = 1024;
const QUALITY = 0.6;

/**
 * Downscale a picked photo and return JPEG base64.
 *
 * Falls back to whatever base64 the picker already produced if manipulation fails,
 * so a manipulator problem costs bandwidth rather than blocking the log entirely.
 */
export async function prepareImage(asset) {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    context.resize({ width: MAX_WIDTH });
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      format: ImageManipulator.SaveFormat.JPEG,
      compress: QUALITY,
      base64: true,
    });
    if (result.base64) {
      return { base64: result.base64, uri: result.uri, mimeType: 'image/jpeg' };
    }
  } catch (error) {
    console.warn('image resize failed, sending original', error);
  }

  if (asset.base64) {
    return { base64: asset.base64, uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
  }
  throw new Error('Could not read that photo.');
}

/** Fetch the local file back as a blob so it can go to Firebase Storage. */
export async function uriToBlob(uri) {
  const response = await fetch(uri);
  return response.blob();
}
