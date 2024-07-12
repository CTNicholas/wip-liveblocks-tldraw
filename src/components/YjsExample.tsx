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
        // See below for why this is commented out
        // shareZone={<NameEditor />}
      />
    </div>
  );
}

// From the Liveblocks original fork. Commenting out for now because shareZone is not longer a Tldraw prop
// const NameEditor = track(() => {
//   const editor = useEditor();

//   const { color, name } = editor.user;

//   return (
//     <div style={{ pointerEvents: "all", display: "flex" }}>
//       <input
//         type="color"
//         value={color}
//         onChange={(e) => {
//           editor.user.updateUserPreferences({
//             color: e.currentTarget.value,
//           });
//         }}
//       />
//       <input
//         value={name}
//         onChange={(e) => {
//           editor.user.updateUserPreferences({
//             name: e.currentTarget.value,
//           });
//         }}
//       />
//     </div>
//   );
// });
