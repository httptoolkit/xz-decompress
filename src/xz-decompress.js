import xzwasmBytes from '../dist/native/xz-decompress.wasm';

const ReadableStream = globalThis.ReadableStream
    // Node < 18 support web streams, but it's not available as a global, so we need to require it.
    // This won't be reached in modern browsers, and bundlers will ignore due to 'browser' field in package.json:
    || require('stream/web').ReadableStream;

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

export class XzReadableStream extends ReadableStream {
    static _moduleInstancePromise;
    static _moduleInstance;
    static async _getModuleInstance() {
        const base64Wasm = xzwasmBytes.replace('data:application/wasm;base64,', '');
        const wasmBytes = Uint8Array.from(atob(base64Wasm), c => c.charCodeAt(0)).buffer;
        const wasmOptions = {};
        const module = await WebAssembly.instantiate(wasmBytes, wasmOptions);
        XzReadableStream._moduleInstance = module.instance;
    }

    constructor(compressedStream) {
        let xzContext;
        let unconsumedInput = null;
        const compressedReader = compressedStream.getReader();

        super({
            async start(controller) {
                if (!XzReadableStream._moduleInstance) {
                    await (XzReadableStream._moduleInstancePromise || (XzReadableStream._moduleInstancePromise = XzReadableStream._getModuleInstance()));
                }
                xzContext = new XzContext(XzReadableStream._moduleInstance);
            },

            async pull(controller) {
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
                    xzContext.dispose(); // Not sure if this always happens
                    controller.close();
                }
            },
            cancel() {
                xzContext.dispose(); // Not sure if this always happens
                return compressedReader.cancel();
            }
        });
    }
}
