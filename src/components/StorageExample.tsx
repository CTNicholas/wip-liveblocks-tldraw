"use client";
\
import "tldraw/tldraw.css";
import { Tldraw } from "@tldraw/tldraw";
import { useStorageStore } from "./useStorageStore";

export function StorageExample() {
  const currentUser = {
    id: "user123",
    color: "blue",
    name: "Alice",
  };
  const store = useStorageStore({
    roomId: "my-room",
    user: currentUser,
  });

  return (
    <div className="tldraw__editor">
      <Tldraw
        autoFocus
        store={store}
      />
    </div>
  );
}
