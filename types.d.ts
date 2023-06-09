export class XzReadableStream extends ReadableStream<Uint8Array> {
    constructor(compressedStream: ReadableStream);
}