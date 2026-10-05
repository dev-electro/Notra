import { newId } from '@/core';

export type PhotoSource = 'camera' | 'gallery';

/**
 * Take or choose a household photo. Everything native is imported on demand. The picture is shrunk to
 * 512px wide / JPEG ~60% (a few tens of KB) and copied into the app's document folder; only that local
 * file URI is stored. Nothing is uploaded. Returns null if cancelled or denied.
 */
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  try {
    const Picker = await import('expo-image-picker');
    const options = { mediaTypes: ['images' as const], quality: 0.5, allowsEditing: true, aspect: [1, 1] as [number, number] };
    if (source === 'camera') {
      const perm = await Picker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
    }
    const res =
      source === 'camera' ? await Picker.launchCameraAsync(options) : await Picker.launchImageLibraryAsync(options);
    if (res.canceled || !res.assets[0]) return null;

    const Manip = await import('expo-image-manipulator');
    const ref = await Manip.ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 512 }).renderAsync();
    const small = await ref.saveAsync({ compress: 0.6, format: Manip.SaveFormat.JPEG });

    const FS = await import('expo-file-system');
    const dir = new FS.Directory(FS.Paths.document, 'photos');
    dir.create({ idempotent: true, intermediates: true });
    const dest = new FS.File(dir, `${newId()}.jpg`);
    new FS.File(small.uri).copy(dest);
    return dest.uri;
  } catch {
    return null;
  }
}
