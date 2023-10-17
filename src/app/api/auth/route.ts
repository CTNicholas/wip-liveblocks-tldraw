import { authorize } from "@liveblocks/node";

const secret = process.env.LIVEBLOCKS_SECRET_KEY as string;

export async function POST(request: Request) {
  /**
   * Implement your own security here.
   *
   * It's your responsibility to ensure that the caller of this endpoint
   * is a valid user by validating the cookies or authentication headers
   * and that it has access to the requested room.
   */
  const { room } = await request.json();

  const result = await authorize({
    room,
    secret,
    userId: "123",
    groupIds: ["456"], // Optional
    userInfo: {
      // Optional, corresponds to the UserMeta[info] type defined in liveblocks.config.ts
      name: "Ada Lovelace",
      color: "red",
    },
  });

  return new Response(result.body);
}
