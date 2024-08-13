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
  react,
  PageRecordType,
} from "@tldraw/tldraw";
import { useEffect, useMemo, useState } from "react";

import { useRoom } from "@/liveblocks.config";
import {
  DocumentRecordType,
  getUserPreferences,
  setUserPreferences,
  TLDocument,
  TLPageId,
  TLStoreEventInfo,
} from "tldraw";
import { LiveMap } from "@liveblocks/core";

export function useStorageStore({
  roomId = "my-liveblocks-room",
  shapeUtils = [],
  user,
}: Partial<{
  hostUrl: string;
  roomId: string;
  version: number;
  shapeUtils: TLAnyShapeUtilConstructor[];
  user: {
    // Use Computed type here
    id: string;
    color: string;
    name: string;
  };
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
    setStoreWithStatus({ status: "loading" });

    const unsubs: (() => void)[] = [];

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
        //store.clear();
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
      unsubs.push(store.listen(
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
      ));

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

      unsubs.push(store.listen(syncStoreWithPresence, {
        source: "user",
        scope: "session",
      }));

      unsubs.push(store.listen(syncStoreWithPresence, {
        source: "user",
        scope: "presence",
      }));

      unsubs.push(room.subscribe(
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
      ));

      // === PRESENCE ===================================================

      const userPreferences = computed<{
        id: string;
        color: string;
        name: string;
      }>("userPreferences", () => {
        if (!user) {
          // Ths is here to make the typescript compiler happy.
          throw new Error("Failed to get user");
        }
        return {
          id: user.id,
          color: user.color,
          name: user.name,
        };
      });

      // TODO - Confirm if this is the proper yClientId. Absolutely not sure
      const self = room.getSelf();
      // @ts-ignore
      const yClientId = "" + self?.connectionId;
      const presenceId = InstancePresenceRecordType.createId(yClientId);

      const presenceDerivation =
        createPresenceStateDerivation(userPreferences)(store);

      // Set our initial presence from the derivation's current value
      // This seemingly works but the typing is a mismatch between JsonObject and TLInstancePresence.
      // Not sure if that's a problem or not
     room.updatePresence({
        // @ts-ignore
        presence: presenceDerivation.get() ?? null
      });

      // When the derivation change, sync presence to to yjs awareness
      unsubs.push(
        react("when presence changes", () => {
          const presence = presenceDerivation.get() ?? null;
          requestAnimationFrame(() => {
            // See above for ts-ignore comments.
            // @ts-ignore
            room.updatePresence({ presence })
          });
        })
      );

      // Sync room presence changes with the store
      unsubs.push(room.subscribe("others", (others, event) => {
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
            toPut.push(event.user.presence.presence);
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
          console.log(toPut);
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      }));

      // === END PRESENCE =======================================================

      setStoreWithStatus({
        store,
        status: "synced-remote",
        connectionStatus: "online",
      });
    }


    setup();




      setStoreWithStatus({
        store,
        status: "synced-remote",
        connectionStatus: "online",
      });


    return () => {
      unsubs.forEach((fn) => fn());
      unsubs.length = 0;
    };
  }, [room, store]);

  return storeWithStatus;
}
