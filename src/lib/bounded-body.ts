export class BodyTooLarge extends Error {}
export async function boundedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {await reader.cancel();throw new BodyTooLarge();}
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {reader.releaseLock();}
}
