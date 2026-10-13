export class XzReadableStream extends ReadableStream<Uint8Array> {
    /**
     * Provide a pre-compiled WebAssembly.Module for runtimes that block
     * dynamic compilation (e.g. Cloudflare Workers).
     */
    static setWasmModule(wasmModule: WebAssembly.Module): void;
    constructor(compressedStream: ReadableStream<Uint8Array>);
}