import { Firestore } from "@google-cloud/firestore";
import { config } from "./config.js";

let cachedDb;

export function getDb() {
  if (!cachedDb) {
    cachedDb = new Firestore({
      projectId: config.googleCloudProject || undefined,
      databaseId: config.firestoreDatabaseId
    });
  }

  return cachedDb;
}

export function businessRef(businessId = "default") {
  return getDb().collection("businesses").doc(businessId);
}

export async function getBusiness(businessId = "default") {
  const snapshot = await businessRef(businessId).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function setBusiness(data, businessId = "default") {
  const now = new Date().toISOString();
  await businessRef(businessId).set(
    {
      ...data,
      updatedAt: now,
      createdAt: data.createdAt ?? now
    },
    { merge: true }
  );
}

export async function listCollection(collectionName, limit = 25) {
  const snapshot = await businessRef().collection(collectionName).orderBy("createdAt", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

export async function createCollectionDoc(collectionName, data) {
  const now = new Date().toISOString();
  const ref = await businessRef().collection(collectionName).add({
    ...data,
    createdAt: now,
    updatedAt: now
  });

  return { id: ref.id };
}

export async function updateCollectionDoc(collectionName, docId, data) {
  const now = new Date().toISOString();
  await businessRef().collection(collectionName).doc(docId).set(
    {
      ...data,
      updatedAt: now
    },
    { merge: true }
  );
}
