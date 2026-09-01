/**
 * Web stub: the sandbox filesystem.
 *
 * Everything reports "does not exist", which is the honest answer in a browser
 * and puts Settings in its not-downloaded state — the state most users see.
 */
export const Paths = { document: '/document', cache: '/cache' } as const;

export class Directory {
  readonly uri: string;
  constructor(...parts: unknown[]) {
    this.uri = parts.map(String).join('/');
  }
  get exists(): boolean {
    return false;
  }
  create(): void {}
  delete(): void {}
  list(): never[] {
    return [];
  }
}

export class File {
  readonly uri: string;
  constructor(...parts: unknown[]) {
    this.uri = parts.map(String).join('/');
  }
  get exists(): boolean {
    return false;
  }
  get size(): number | null {
    return null;
  }
  write(): void {}
  text(): string {
    return '';
  }
  delete(): void {}
  static async downloadFileAsync(): Promise<never> {
    throw new Error('downloads are native-only in the web preview');
  }
}
