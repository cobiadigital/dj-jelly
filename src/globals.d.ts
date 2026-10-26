// Injected at build time by vite.config.ts.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

// File System Access API pieces not yet in TypeScript's DOM types (Chrome/Edge only).
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FileSystemHandle {
  queryPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<'granted' | 'prompt' | 'denied'>;
  requestPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<'granted' | 'prompt' | 'denied'>;
}
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
}
interface Window {
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}
interface Navigator {
  audioSession?: { type: string };
}
