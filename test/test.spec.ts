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

async function collectOutputString(stream: XzReadableStream) {
    let result: string = "";
    for await (const chunk of stream as NodeReadableStream<Uint8Array>) {
        result += new TextDecoder().decode(chunk);
    }
    return result;
}

describe("Streaming XS decompression", () => {
    it("can decompress a demo test stream", async () => {
        const dataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const stream = new XzReadableStream(dataStream);

        const result = await collectOutputString(stream);

        expect(result).to.equal('hello world\n');
    });

    it("can decompress two demo test streams in parallel", async () => {
        const dataStream1 = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const dataStream2 = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const stream1 = new XzReadableStream(dataStream1);
        const stream2 = new XzReadableStream(dataStream2);

        const [result1, result2] = await Promise.all([
            collectOutputString(stream1),
            collectOutputString(stream2)
        ]);

        expect(result1).to.equal('hello world\n');
        expect(result2).to.equal('hello world\n');
    });

    it("can decompress many demo test streams in parallel", async () => {
        const streams = [];
        const promises = [];

        for (let i = 0; i < 10_000; i++) {
            const dataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
            const stream = new XzReadableStream(dataStream);
            streams.push(stream);
            promises.push(collectOutputString(stream));
        }

        const results = await Promise.all(promises);

        for (const result of results) {
            expect(result).to.equal('hello world\n');
        }
    });
});