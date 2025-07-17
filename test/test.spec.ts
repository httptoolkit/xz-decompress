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

    it("handles errors without causing deadlocks", async () => {
        // Create a stream that will fail during decompression
        const badDataStream = buildStaticDataStream(Buffer.from('invalid-xz-data', 'utf8'));
        const stream = new XzReadableStream(badDataStream);

        // The stream should fail, but not hang
        try {
            await collectOutputString(stream);
            expect.fail('Expected stream to throw an error');
        } catch (error) {
            // This is expected - the stream should fail with an error
            expect(error).to.be.an('error');
        }

        // After the error, we should be able to create new streams successfully
        // This verifies that the mutex was properly released
        const validDataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const validStream = new XzReadableStream(validDataStream);

        const result = await collectOutputString(validStream);
        expect(result).to.equal('hello world\n');
    });

    it("handles stream cancellation without deadlocks", async () => {
        const dataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const stream = new XzReadableStream(dataStream);

        // Start reading the stream
        const reader = stream.getReader();
        const { value } = await reader.read();
        expect(value).to.be.instanceOf(Uint8Array);

        // Cancel the stream
        await reader.cancel();

        // After cancellation, we should be able to create new streams successfully
        // This verifies that the mutex was properly released during cancellation
        const validDataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const validStream = new XzReadableStream(validDataStream);

        const result = await collectOutputString(validStream);
        expect(result).to.equal('hello world\n');
    });

    it("handles multiple errors without permanent deadlocks", async () => {
        const promises = [];

        // Create multiple streams that will fail
        for (let i = 0; i < 5; i++) {
            const badDataStream = buildStaticDataStream(Buffer.from(`invalid-xz-data-${i}`, 'utf8'));
            const stream = new XzReadableStream(badDataStream);
            promises.push(
                collectOutputString(stream).catch(error => {
                    // Expected to fail
                    expect(error).to.be.an('error');
                    return null; // Mark as handled
                })
            );
        }

        // Wait for all streams to fail
        const results = await Promise.all(promises);

        // All should have failed (returned null from catch)
        for (const result of results) {
            expect(result).to.be.null;
        }

        // After all errors, we should still be able to create valid streams
        // This verifies that the mutex isn't permanently locked
        const validDataStream = buildStaticDataStream(Buffer.from(HELLO_WORLD_XZ, 'base64'));
        const validStream = new XzReadableStream(validDataStream);

        const result = await collectOutputString(validStream);
        expect(result).to.equal('hello world\n');
    });
});