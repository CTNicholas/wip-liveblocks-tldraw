"use client";

import { ReactNode } from "react";
import { RoomProvider } from "@/liveblocks.config";
import { ClientSideSuspense } from "@liveblocks/react";
import { Loading } from "@/components/Loading";
import { LiveList, LiveMap } from "@liveblocks/client";

export default function Room({ children }: { children: ReactNode }) {
  return (
    <RoomProvider
      id={"my-liveblocks-room"}
      initialPresence={{}}
      initialStorage={{ records: new LiveMap() }}
    >
      <ClientSideSuspense fallback={<Loading />}>
        {() => children}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
