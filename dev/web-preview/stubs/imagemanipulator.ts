/** Web stub: resize + EXIF rotate are native. Passes the URI straight through. */
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const;

export const ImageManipulator = {
  manipulate(uri: string) {
    const chain = {
      resize: () => chain,
      rotate: () => chain,
      flip: () => chain,
      crop: () => chain,
      extent: () => chain,
      async renderAsync() {
        return {
          async saveAsync() {
            return { uri, width: 1200, height: 1600 };
          },
        };
      },
    };
    return chain;
  },
};
