"use client";

import { ReactNode } from "react";
import { RoomProvider } from "@/liveblocks.config";
import { ClientSideSuspense } from "@liveblocks/react";
import { Loading } from "@/components/Loading";

export default function Room({ children }: { children: ReactNode }) {
  return (
    <RoomProvider
      id={"my-liveblocks-yjs-room"}
      initialPresence={{}}
      initialStorage={{}}
    >
      <ClientSideSuspense fallback={<Loading />}>
        {() => children}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
