import {
  InstancePresenceRecordType,
  TLAnyShapeUtilConstructor,
  TLInstancePresence,
  TLRecord,
  TLStoreWithStatus,
  computed,
  createPresenceStateDerivation,
  createTLStore,
  defaultShapeUtils,
  defaultUserPreferences,
  getUserPreferences,
  react,
  TLStoreEventInfo,
  DocumentRecordType,
  PageRecordType,
  TLPageId,
  TLDocument,
  setUserPreferences,
} from "@tldraw/tldraw";
import { useEffect, useMemo, useState } from "react";
import { useRoom } from "@/liveblocks.config";
import { LiveMap } from "@liveblocks/client";

export function useStorageStore({
  shapeUtils = [],
}: Partial<{
  hostUrl: string;
  version: number;
  shapeUtils: TLAnyShapeUtilConstructor[];
}>) {
  const room = useRoom();

  const [store] = useState(() => {
    const store = createTLStore({
      shapeUtils: [...defaultShapeUtils, ...shapeUtils],
    });
    return store;
  });

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: "loading",
  });

  useEffect(() => {
    const unsubs: Record<string, () => void> = {};

    async function setup() {
      if (!room) return;

      const storage = await room.getStorage();

      const recordsSnapshot = room.getStorageSnapshot()?.get("records");

      if (!recordsSnapshot) {
        // Initialize storage with records from store
        storage.root.set("records", new LiveMap());
        const liveRecords = storage.root.get("records");
        room.batch(() => {
          store.allRecords().forEach((record) => {
            liveRecords.set(record.id, record);
          });
        });
      } else {
        // Initialize store with records from storage
        store.clear();
        store.put(
          [
            DocumentRecordType.create({
              id: "document:document" as TLDocument["id"],
            }),
            PageRecordType.create({
              id: "page:page" as TLPageId,
              name: "Page 1",
              index: "a1",
            }),
            ...[...recordsSnapshot.values()],
          ],
          "initialize"
        );
      }

      const liveRecords = storage.root.get("records");

      // Sync store changes with room document
      unsubs.store_document = store.listen(
        ({ changes }: TLStoreEventInfo) => {
          room.batch(() => {
            Object.values(changes.added).forEach((record) => {
              liveRecords.set(record.id, record);
            });

            Object.values(changes.updated).forEach(([_, record]) => {
              liveRecords.set(record.id, record);
            });

            Object.values(changes.removed).forEach((record) => {
              liveRecords.delete(record.id);
            });
          });
        },
        { source: "user", scope: "document" }
      );

      // Sync store changes with room presence
      function syncStoreWithPresence({ changes }: TLStoreEventInfo) {
        room.batch(() => {
          Object.values(changes.added).forEach((record) => {
            room.updatePresence({ [record.id]: record });
          });

          Object.values(changes.updated).forEach(([_, record]) => {
            room.updatePresence({ [record.id]: record });
          });

          Object.values(changes.removed).forEach((record) => {
            room.updatePresence({ [record.id]: null });
          });
        });
      }

      unsubs.store_session = store.listen(syncStoreWithPresence, {
        source: "user",
        scope: "session",
      });

      unsubs.store_presence = store.listen(syncStoreWithPresence, {
        source: "user",
        scope: "presence",
      });

      unsubs.room_document = room.subscribe(
        liveRecords,
        (storageChanges) => {
          const toRemove: TLRecord["id"][] = [];
          const toPut: TLRecord[] = [];

          for (const update of storageChanges) {
            if (update.type !== "LiveMap") {
              return;
            }
            for (const [id, { type }] of Object.entries(update.updates)) {
              if (type === "delete") {
                toRemove.push(id as TLRecord["id"]);
              } else {
                const curr = update.node.get(id);
                if (curr) {
                  toPut.push(curr as TLRecord);
                }
              }
            }
          }

          // Push changes to tldraw
          store.mergeRemoteChanges(() => {
            if (toRemove.length) {
              store.remove(toRemove);
            }
            if (toPut.length) {
              store.put(toPut);
            }
          });
        },
        { isDeep: true }
      );

      // === PRESENCE ===================================================

      const connectionId = `${room.getSelf()?.connectionId || 0}`;
      console.log("conenction id is", connectionId);
      setUserPreferences({ id: connectionId });

      const userPreferences = computed<{
        id: string;
        color: string;
        name: string;
      }>("userPreferences", () => {
        const user = getUserPreferences();
        return {
          id: user.id,
          color: user.color ?? defaultUserPreferences.color,
          name: user.name ?? defaultUserPreferences.name,
        };
      });

      // Create the instance presence derivation
      const presenceId = InstancePresenceRecordType.createId(connectionId);
      const presenceDerivation = createPresenceStateDerivation(
        userPreferences,
        presenceId
      )(store);

      console.log(presenceDerivation.value);

      // Set our initial presence from the derivation's current value
      room.updatePresence({ presence: presenceDerivation.value });

      // When the derivation change, sync presence to yjs awareness

      unsubs.room_my_presence = react("when presence changes", (e) => {
        // requestAnimationFrame(() => {
        // setTimeout(() => {
        // console.log("update self?", presenceDerivation.value);

        room.updatePresence({ presence: presenceDerivation.value });

        // });
        // });
      });

      // Sync room presence changes with the store
      unsubs.room_presence = room.subscribe("others", (others, event) => {
        const toRemove: TLInstancePresence["id"][] = [];
        const toPut: TLInstancePresence[] = [];

        if (event.type === "leave") {
          if (event.user.connectionId) {
            toRemove.push(
              InstancePresenceRecordType.createId(`${event.user.connectionId}`)
            );
          }
        } else if (event.type !== "reset") {
          const presence = event?.user?.presence;
          if (presence?.presence) {
            toPut.push(...Object.values(event.user.presence));
          }
        } else {
          others.forEach((other) => {
            toRemove.push(
              InstancePresenceRecordType.createId(`${other.connectionId}`)
            );
          });
        }

        // put / remove the records in the store
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      });

      // === END PRESENCE =======================================================

      setStoreWithStatus({
        store,
        status: "synced-remote",
        connectionStatus: "online",
      });
    }

    setup();

    return () => {
      Object.values(unsubs).forEach((unsub) => unsub());
    };
  }, [store, room]);

  return storeWithStatus;
}
