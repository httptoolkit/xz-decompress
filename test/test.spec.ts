import { ReadableStream as NodeReadableStream } from 'stream/web';
import { expect } from 'chai';

import { XzReadableStream  } from "..";

// echo 'hello world' | xz - | base64 -w0
const HELLO_WORLD_XZ = "/Td6WFoAAATm1rRGAgAhARYAAAB0L+WjAQALaGVsbG8gd29ybGQKAKHy/8Rqf7/PAAEkDKYY2NgftvN9AQAAAAAEWVo=";

const buildStaticDataStream = (data: Uint8Array) => {
    return new NodeReadableStream<Uint8Array>({
        pull: (controller) => {
            controller.enqueue(data);
            controller.close();
        }
    }) as ReadableStream<Uint8Array>;
};

describe("Streaming XS decompression", () => {
    it("can decompress a demo test stream", async () => {
        const dataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const stream = new XzReadableStream(dataStream) as NodeReadableStream<Uint8Array>;

        let result: string = "";
        for await (const chunk of stream) {
            result += new TextDecoder().decode(chunk);
        }

        expect(result).to.equal('hello world\n');
    })
});