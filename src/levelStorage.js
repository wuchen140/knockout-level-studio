const DATABASE_NAME = "knockout-level-studio";
const STORE_NAME = "levels";

function storageKey(key) {
  return `knockout:level:${key}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Cannot open level storage"));
  });
}

async function databaseRequest(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Level storage request failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Level storage transaction aborted"));
    });
  } finally {
    database.close();
  }
}

export async function loadStoredLevel(key) {
  if (!key) return null;
  try {
    const stored = await databaseRequest("readonly", (store) => store.get(key));
    if (typeof stored === "string" && stored) return stored;
  } catch {
    // Older browsers continue through the localStorage compatibility path.
  }
  try {
    return window.localStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

export async function saveStoredLevel(key, snapshot) {
  if (!key || !snapshot) throw new Error("Invalid level snapshot");
  let databaseSaved = false;
  try {
    await databaseRequest("readwrite", (store) => store.put(snapshot, key));
    databaseSaved = true;
  } catch {
    databaseSaved = false;
  }

  let localSaved = false;
  try {
    window.localStorage.setItem(storageKey(key), snapshot);
    localSaved = true;
  } catch {
    localSaved = false;
  }
  if (!databaseSaved && !localSaved) throw new Error("Browser storage is full or unavailable");
  return databaseSaved ? "database" : "local";
}

export async function removeStoredLevel(key) {
  if (!key) return;
  try {
    await databaseRequest("readwrite", (store) => store.delete(key));
  } catch {
    // Keep cleanup best-effort so a damaged entry never blocks the editor.
  }
  try {
    window.localStorage.removeItem(storageKey(key));
  } catch {
    // Ignore unavailable localStorage.
  }
}
