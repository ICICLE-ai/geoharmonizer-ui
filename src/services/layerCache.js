/*
 * Keeps uploaded boundaries around between visits.
 *
 * The map component stays mounted while the user moves between views,
 * so this cache is what survives a full reload: layers are stored as
 * plain GeoJSON in IndexedDB (localStorage is too small for real
 * boundary files) and rehydrated on the next start.
 *
 * Caching is best effort — every call resolves even when storage is
 * unavailable or full, because losing the cache must never take the
 * map down with it.
 */

const DB_NAME = "geoharmonizer-ui";
const DB_VERSION = 1;
const STORE = "map-layers";
const RECORD_KEY = "current";


function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));

      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, {
          keyPath: "key",
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("IndexedDB is blocked."));
  });
}


function runTransaction(mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(
          STORE,
          mode
        );

        const request = work(
          transaction.objectStore(STORE)
        );

        transaction.oncomplete = () => {
          db.close();
          resolve(request?.result);
        };

        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };

        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      })
  );
}


/*
 * Stores the layer list. Only plain data is written — the `__gh`
 * metadata is non-enumerable and gets rebuilt on load anyway, and
 * structured clone would drop it regardless.
 */
export async function saveCachedLayers(layers) {
  const record = {
    key: RECORD_KEY,

    savedAt: Date.now(),

    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      features: layer.features,
    })),
  };

  try {
    await runTransaction("readwrite", (store) =>
      store.put(record)
    );

    return true;
  } catch {
    return false;
  }
}


/*
 * Returns the stored layers, or an empty list when nothing is
 * cached or storage cannot be read.
 */
export async function loadCachedLayers() {
  try {
    const record = await runTransaction(
      "readonly",
      (store) => store.get(RECORD_KEY)
    );

    return record?.layers ?? [];
  } catch {
    return [];
  }
}
