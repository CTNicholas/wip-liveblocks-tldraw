"use client";

import { Tldraw, track, useEditor } from "@tldraw/tldraw";
import { useYjsStore } from "./useYjsStore";

export function YjsExample() {
  const store = useYjsStore({
    roomId: "my-room",
  });

  return (
    <div className="tldraw__editor">
      <Tldraw autoFocus store={store} shareZone={<NameEditor />} />
    </div>
  );
}

const NameEditor = track(() => {
  const editor = useEditor();

  const { color, name } = editor.user;

  return (
    <div style={{ pointerEvents: "all", display: "flex" }}>
      <input
        type="color"
        value={color}
        onChange={(e) => {
          editor.user.updateUserPreferences({
            color: e.currentTarget.value,
          });
        }}
      />
      <input
        value={name}
        onChange={(e) => {
          editor.user.updateUserPreferences({
            name: e.currentTarget.value,
          });
        }}
      />
    </div>
  );
});
