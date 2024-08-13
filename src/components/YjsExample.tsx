"use client";

import "tldraw/tldraw.css";
import { Tldraw } from "@tldraw/tldraw";
import { useYjsStore } from "./useYjsStore";

export function YjsExample() {
  const currentUser = {
    id: "user123",
    color: "blue",
    name: "Alice",
  };
  const store = useYjsStore({
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
