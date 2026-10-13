import xzwasmBytes from '../dist/native/xz-decompress.wasm';

const ReadableStream = globalThis.ReadableStream
    // Node < 18 support web streams, but it's not available as a global, so we need to require it.
    // This won't be reached in modern browsers, and bundlers will ignore due to 'browser' field in package.json:
    || require('stream/web').ReadableStream;

// Try to compile the wasm module eagerly at import time. This fails in runtimes
// like Cloudflare Workers that block WebAssembly.compile entirely; those runtimes
// must call XzReadableStream.setWasmModule() with a pre-compiled module instead.
let _wasmModulePromise = (async () => {
    const base64Wasm = xzwasmBytes.replace('data:application/wasm;base64,', '');
    const wasmBytes = Uint8Array.from(atob(base64Wasm), c => c.charCodeAt(0)).buffer;
    return WebAssembly.compile(wasmBytes);
})().catch(() => null);

const XZ_OK = 0;
const XZ_STREAM_END = 1;

class XzContext {
    constructor(moduleInstance) {
        this.exports = moduleInstance.exports;
        this.memory = this.exports.memory;
        this.ptr = this.exports.create_context();
        this._refresh();
        this.bufSize = this.mem32[0];
        this.inStart = this.mem32[1] - this.ptr;
        this.inEnd = this.inStart + this.bufSize;
        this.outStart = this.mem32[4] - this.ptr;
    }

    supplyInput(sourceDataUint8Array) {
        this._refresh();
        const inBuffer = this.mem8.subarray(this.inStart, this.inEnd);
        inBuffer.set(sourceDataUint8Array, 0);
        this.exports.supply_input(this.ptr, sourceDataUint8Array.byteLength);
        this._refresh();
    }

    getNextOutput() {
        const result = this.exports.get_next_output(this.ptr);
        this._refresh();
        if (result !== XZ_OK && result !== XZ_STREAM_END) {
            throw new Error(`get_next_output failed with error code ${result}`);
        }
        const outChunk = this.mem8.slice(this.outStart, this.outStart + /* outPos */ this.mem32[5]);
        return { outChunk, finished: result === XZ_STREAM_END };
    }

    needsMoreInput() {
        return /* inPos */ this.mem32[2] === /* inSize */ this.mem32[3];
    }

    outputBufferIsFull() {
        return /* outPos */ this.mem32[5] === this.bufSize;
    }

    resetOutputBuffer() {
        this.outPos = this.mem32[5] = 0;
    }

    dispose() {
        this.exports.destroy_context(this.ptr);
        this.exports = null;
    }

    _refresh() {
        if (this.memory.buffer !== this.mem8?.buffer) {
            this.mem8 = new Uint8Array(this.memory.buffer, this.ptr);
            this.mem32 = new Uint32Array(this.memory.buffer, this.ptr);
        }
    }
}

// Simple mutex to serialize context creation and prevent resource exhaustion
class ContextMutex {
    constructor() {
        this.locked = false;
        this.waitQueue = [];
    }

    async acquire() {
        if (!this.locked) {
            this.locked = true;
            return;
        }

        // Wait in queue
        return new Promise((resolve) => {
            this.waitQueue.push(resolve);
        });
    }

    release() {
        if (this.waitQueue.length > 0) {
            const next = this.waitQueue.shift();
            next();
        } else {
            this.locked = false;
        }
    }
}

export class XzReadableStream extends ReadableStream {
    static _moduleInstancePromise;
    static _moduleInstance;
    static _contextMutex = new ContextMutex();

    /**
     * Provide a pre-compiled WebAssembly.Module for runtimes that block
     * dynamic compilation (e.g. Cloudflare Workers).
     */
    static setWasmModule(wasmModule) {
        _wasmModulePromise = Promise.resolve(wasmModule);
        XzReadableStream._moduleInstance = null;
        XzReadableStream._moduleInstancePromise = null;
    }

    static async _getModuleInstance() {
        const compiledModule = await _wasmModulePromise;
        if (!compiledModule) {
            throw new Error(
                'WebAssembly compilation is not available in this runtime. ' +
                'Call XzReadableStream.setWasmModule(module) with a pre-compiled WebAssembly.Module before use.'
            );
        }
        XzReadableStream._moduleInstance = await WebAssembly.instantiate(compiledModule);
    }

    constructor(compressedStream) {
        let xzContext;
        let unconsumedInput = null;
        let finalized = false;
        let initError = null;
        const compressedReader = compressedStream.getReader();

        function finalizeOnce() {
            if (finalized) return;
            finalized = true;
            if (xzContext) {
                xzContext.dispose();
                xzContext = null;
            }
            XzReadableStream._contextMutex.release();
        }

        const initPromise = (async () => {
            await XzReadableStream._contextMutex.acquire();
            try {
                if (!XzReadableStream._moduleInstance) {
                    await (XzReadableStream._moduleInstancePromise || (XzReadableStream._moduleInstancePromise = XzReadableStream._getModuleInstance()));
                }
                xzContext = new XzContext(XzReadableStream._moduleInstance);
            } catch (error) {
                initError = error;
                XzReadableStream._contextMutex.release();
            }
        })();

        super({
            async start() {
                await initPromise;
                if (initError) throw initError;
            },

            async pull(controller) {
                await initPromise;
                if (initError) throw initError;

                try {
                    if (xzContext.needsMoreInput()) {
                        if (unconsumedInput === null || unconsumedInput.byteLength === 0) {
                            const { done, value } = await compressedReader.read();
                            if (!done) {
                                unconsumedInput = value;
                            }
                        }
                        const nextInputLength = Math.min(xzContext.bufSize, unconsumedInput.byteLength);
                        xzContext.supplyInput(unconsumedInput.subarray(0, nextInputLength));
                        unconsumedInput = unconsumedInput.subarray(nextInputLength);
                    }

                    const nextOutputResult = xzContext.getNextOutput();
                    controller.enqueue(nextOutputResult.outChunk);
                    xzContext.resetOutputBuffer();

                    if (nextOutputResult.finished) {
                        finalizeOnce();
                        controller.close();
                    }
                } catch (error) {
                    finalizeOnce();
                    throw error;
                }
            },
            async cancel() {
                await initPromise;
                try {
                    return compressedReader.cancel();
                } finally {
                    finalizeOnce();
                }
            }
        });
    }
}
