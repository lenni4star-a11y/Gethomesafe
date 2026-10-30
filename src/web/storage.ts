// Lokale Speicherung im Gerät (IndexedDB). Kein Server, keine Accounts.

import { del, get, set } from 'idb-keyval';
import { useCallback, useEffect, useState } from 'react';

export async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    return ((await get(key)) as T | undefined) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function save<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value);
  } catch {
    // z. B. privater Modus: dann eben nur für diese Sitzung
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    /* egal */
  }
}

/** Zustand, der automatisch im Gerät gespeichert wird */
export function useStored<T>(key: string, fallback: T, normalize: (v: T) => T = (v) => v): [T, (v: T | ((old: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    load(key, fallback).then((v) => {
      setValue(normalize(v));
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (v: T | ((old: T) => T)) =>
      setValue((old) => {
        const next = typeof v === 'function' ? (v as (o: T) => T)(old) : v;
        save(key, next);
        return next;
      }),
    [key],
  );
  return [value, update, ready];
}
