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
  react,
  transact,
} from "@tldraw/tldraw";
import { useEffect, useMemo, useState } from "react";
import { YKeyValue } from "y-utility/y-keyvalue";
import * as Y from "yjs";
// import LiveblocksProvider from "@liveblocks/yjs";
import { LiveblocksYjsProvider } from "@liveblocks/yjs";

import { useRoom } from "@/liveblocks.config";

export function useYjsStore({
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
  const [store] = useState(() => {
    const store = createTLStore({
      shapeUtils: [...defaultShapeUtils, ...shapeUtils],
    });
    return store;
  });

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: "loading",
  });

  const liveblocksRoom = useRoom();

  const { yDoc, yStore, room } = useMemo(() => {
    const yDoc = new Y.Doc({ gc: true });
    const yArr = yDoc.getArray<{ key: string; val: TLRecord }>(`tl_${roomId}`);
    const yStore = new YKeyValue(yArr);

    return {
      yDoc,
      yStore,
      room: new LiveblocksYjsProvider(liveblocksRoom, yDoc),
    };
  }, [liveblocksRoom, roomId]);

  useEffect(() => {
    setStoreWithStatus({ status: "loading" });

    const unsubs: (() => void)[] = [];

    function handleSync() {
      // 1.
      // Connect store to yjs store and vis versa, for both the document and awareness

      /* -------------------- Document -------------------- */

      // Sync store changes to the yjs doc
      unsubs.push(
        store.listen(
          function syncStoreChangesToYjsDoc({ changes }) {
            yDoc.transact(() => {
              Object.values(changes.added).forEach((record) => {
                yStore.set(record.id, record);
              });

              Object.values(changes.updated).forEach(([_, record]) => {
                yStore.set(record.id, record);
              });

              Object.values(changes.removed).forEach((record) => {
                yStore.delete(record.id);
              });
            });
          },
          { source: "user", scope: "document" } // only sync user's document changes
        )
      );

      // Sync the yjs doc changes to the store
      const handleChange = (
        changes: Map<
          string,
          | { action: "delete"; oldValue: TLRecord }
          | { action: "update"; oldValue: TLRecord; newValue: TLRecord }
          | { action: "add"; newValue: TLRecord }
        >,
        transaction: Y.Transaction
      ) => {
        if (transaction.local) return;

        const toRemove: TLRecord["id"][] = [];
        const toPut: TLRecord[] = [];

        changes.forEach((change, id) => {
          switch (change.action) {
            case "add":
            case "update": {
              const record = yStore.get(id)!;
              toPut.push(record);
              break;
            }
            case "delete": {
              toRemove.push(id as TLRecord["id"]);
              break;
            }
          }
        });

        // put / remove the records in the store
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };

      yStore.on("change", handleChange);
      unsubs.push(() => yStore.off("change", handleChange));

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
      const self = liveblocksRoom.getSelf();
      // @ts-ignore
      const yClientId = self?.presence.__yjs_clientid;
      const presenceId = InstancePresenceRecordType.createId(yClientId);

      const presenceDerivation =
        createPresenceStateDerivation(userPreferences)(store);

      // Set our initial presence from the derivation's current value
      // This seemingly works but the typing is a mismatch between JsonObject and TLInstancePresence.
      // Not sure if that's a problem or not
      room.awareness.setLocalStateField(
        "presence",
        // @ts-ignore
        presenceDerivation.get() ?? null
      );

      // When the derivation change, sync presence to to yjs awareness
      unsubs.push(
        react("when presence changes", () => {
          const presence = presenceDerivation.get() ?? null;
          requestAnimationFrame(() => {
            // See above for ts-ignore comments.
            // @ts-ignore
            room.awareness.setLocalStateField("presence", presence);
          });
        })
      );

      // Sync yjs awareness changes to the store
      const handleUpdate = (update: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        const states = room.awareness.getStates() as Map<
          number,
          { presence: TLInstancePresence }
        >;

        const toRemove: TLInstancePresence["id"][] = [];
        const toPut: TLInstancePresence[] = [];

        // Connect records to put / remove
        for (const clientId of update.added) {
          const state = states.get(clientId);
          if (state?.presence && state.presence.id !== presenceId) {
            toPut.push(state.presence);
          }
        }

        for (const clientId of update.updated) {
          const state = states.get(clientId);
          if (state?.presence && state.presence.id !== presenceId) {
            toPut.push(state.presence);
          }
        }

        for (const clientId of update.removed) {
          toRemove.push(
            InstancePresenceRecordType.createId(clientId.toString())
          );
        }

        // put / remove the records in the store
        store.mergeRemoteChanges(() => {
          if (toRemove.length > 0) {
            store.remove(toRemove);
          }
          if (toPut.length > 0) {
            store.put(toPut);
          }
        });
      };

      room.awareness.on("update", handleUpdate);
      unsubs.push(() => room.awareness.off("update", handleUpdate));

      // 2.
      // Initialize the store with the yjs doc records—or, if the yjs doc
      // is empty, initialize the yjs doc with the default store records.
      if (yStore.yarray.length) {
        // Replace the store records with the yjs doc records
        transact(() => {
          // The records here should be compatible with what's in the store
          store.clear();
          const records = yStore.yarray.toJSON().map(({ val }) => val);
          store.put(records);
        });
      } else {
        // Create the initial store records
        // Sync the store records to the yjs doc
        yDoc.transact(() => {
          for (const record of store.allRecords()) {
            yStore.set(record.id, record);
          }
        });
      }

      setStoreWithStatus({
        store,
        status: "synced-remote",
        connectionStatus: "online",
      });
    }

    room.on("synced", handleSync);
    unsubs.push(() => room.off("synced", handleSync));
    return () => {
      unsubs.forEach((fn) => fn());
      unsubs.length = 0;
    };
  }, [room, yDoc, store, yStore]);

  return storeWithStatus;
}
