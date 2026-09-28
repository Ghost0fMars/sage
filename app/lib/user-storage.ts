"use client";

import { saveCloudData } from "./cloud-storage";

export type LocalUser = {
  id: string;
  name: string;
};

const USERS_KEY = "sage-users";
const CURRENT_USER_KEY = "sage-current-user";
const DEFAULT_USER: LocalUser = {
  id: "enseignant",
  name: "Enseignant"
};

export const SYNCED_DATA_KEYS = [
  "sage-planning-tiles",
  "sage-prepared-lessons",
  "sage-student-activities",
  "sage-course-presentations",
  "sage-sequences",
  "sage-students",
  "sage-events",
  "sage-evaluations",
  "sage-student-notes",
  "sage-student-photos",
  "sage-reglement-interieur"
];

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || crypto.randomUUID()
  );
}

function safeParse<T>(value: string | null, fallback: T) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readUsers() {
  const users = safeParse<LocalUser[]>(localStorage.getItem(USERS_KEY), []);

  if (users.length > 0) {
    return users;
  }

  localStorage.setItem(USERS_KEY, JSON.stringify([DEFAULT_USER]));
  localStorage.setItem(CURRENT_USER_KEY, DEFAULT_USER.id);
  return [DEFAULT_USER];
}

export function getCurrentUser() {
  const users = readUsers();
  const currentUserId = localStorage.getItem(CURRENT_USER_KEY) ?? DEFAULT_USER.id;
  return users.find((user) => user.id === currentUserId) ?? users[0];
}

export function setCurrentUser(userId: string) {
  localStorage.setItem(CURRENT_USER_KEY, userId);
}

function storageKeyForUser(userId: string, key: string) {
  return `sage:${userId}:${key}`;
}


export function ensureLocalUser(user: LocalUser) {
  const users = readUsers();
  const existingUser = users.find((storedUser) => storedUser.id === user.id);

  if (existingUser) {
    localStorage.setItem(
      USERS_KEY,
      JSON.stringify(
        users.map((storedUser) =>
          storedUser.id === user.id ? { ...storedUser, name: user.name } : storedUser
        )
      )
    );
  } else {
    localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  }

  setCurrentUser(user.id);
  return user;
}

export function createUser(name: string) {
  const users = readUsers();
  const baseId = slugify(name);
  let id = baseId;
  let suffix = 2;

  while (users.some((user) => user.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  const user = { id, name: name.trim() };
  localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
  setCurrentUser(id);
  return user;
}

export function userStorageKey(key: string) {
  return storageKeyForUser(getCurrentUser().id, key);
}

export function userStorageKeyForUser(userId: string, key: string) {
  return storageKeyForUser(userId, key);
}

export function readUserData<T>(key: string, fallback: T, legacyKey?: string) {
  const scopedKey = userStorageKey(key);
  const scopedValue = localStorage.getItem(scopedKey);

  if (scopedValue) {
    return safeParse<T>(scopedValue, fallback);
  }

  if (legacyKey) {
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue) {
      localStorage.setItem(scopedKey, legacyValue);
      return safeParse<T>(legacyValue, fallback);
    }
  }

  return fallback;
}

export function writeUserData<T>(key: string, value: T) {
  localStorage.setItem(userStorageKey(key), JSON.stringify(value));
  void saveCloudData(key, value);
}
