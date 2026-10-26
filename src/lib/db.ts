import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Analysis, DjSet, FolderRecord, LocalTrack } from './types';

interface Schema extends DBSchema {
  sets: { key: string; value: DjSet };
  tracks: { key: string; value: LocalTrack; indexes: { folderId: string } };
  /** audio bytes of imported files (iPhone has no folder access) */
  blobs: { key: string; value: Blob };
  folders: { key: string; value: FolderRecord };
  analysis: { key: string; value: Analysis };
}

let dbp: Promise<IDBPDatabase<Schema>> | undefined;

export function db() {
  dbp ??= openDB<Schema>('dj-jelly', 1, {
    upgrade(d) {
      d.createObjectStore('sets', { keyPath: 'id' });
      d.createObjectStore('tracks', { keyPath: 'id' }).createIndex('folderId', 'folderId');
      d.createObjectStore('blobs');
      d.createObjectStore('folders', { keyPath: 'id' });
      d.createObjectStore('analysis', { keyPath: 'key' });
    },
  });
  return dbp;
}
