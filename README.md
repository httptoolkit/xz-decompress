# XZ-Decompress - Streaming XZ decompression for the browser & Node [![Build Status](https://github.com/httptoolkit/xz-decompress/workflows/CI/badge.svg)](https://github.com/httptoolkit/xz-decompress/actions)

> _Part of [HTTP Toolkit](https://httptoolkit.com): powerful tools for building, testing & debugging HTTP(S)_

This is an NPM package compatible with both Node.js & browsers that can decompress XZ streams.

You can use this if you want your web server to return XZ-encoded content and have your JavaScript code see the uncompressed data (as an alternative to Gzip or Brotli), or if you want to decompress XZ files within Node.js without needing to mess with any native addons.

_This is a fork of https://github.com/SteveSanderson/xzwasm, intended for use in [Frida-JS](https://github.com/httptoolkit/frida-js/) and [HTTP Toolkit](https://httptoolkit.com)._

## Installation

```
npm install --save xz-decompress
```

You can then import things from `xz-decompress` in your existing JavaScript/TypeScript files. Example:

```js
import { XzReadableStream } from 'xz-decompress';
```

## How to use

Given an XZ-compressed stream, such as a `fetch` response body, you can get a decompressed response by wrapping it with `XzReadableStream`. Example:

```js
const compressedResponse = await fetch('somefile.xz');

const decompressedResponse = new Response(
   new XzReadableStream(compressedResponse.body)
);

// We now have a regular Response object, so can use standard APIs to parse its body data,
// such as .text(), .json(), or .arrayBuffer():
const text = await decompressedResponse.text();
```

The API is designed to be as JavaScript-standard as possible, so `XzReadableStream` is a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) instance, which in turn means you can feed it into a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), and in turn get a blob, an ArrayBuffer, JSON data, or anything else that your runtime can do with a `Response`.

If you're using this to decompress content from a file or other source, rather than an HTTP response body, you'll need to get a `ReadableStream` (a web stream) for the file's data to replace the `compressedResponse.body` stream above. For example, in Node.js you could use `Readable.toWeb(fs.createReadStream(filename))` to stream from the disk, or `new Blob([buffer]).stream()` if you already have the data in a `Buffer`.

## What about `.tar.xz` files?

Since the `.xz` format only represents one file, it's common for people to bundle up a collection of files as `.tar`, and then compress this to `.tar.xz`.

XZ-Decompress doesn't have built-in support for `.tar`. However, you can use it to convert a `.tar.xz` stream to a stream representing the `.tar` file, and then pass this data to another library such as [js-untar](https://github.com/InvokIT/js-untar) or [tarballjs](https://github.com/ankitrohatgi/tarballjs) to get the bundled files.

## Building code in this repo

**Note:** This is only needed if you want to work on xz-decompress itself, not if you just want to use it.

 * Clone this repo
 * Clone/update submodules
    * `git submodule update --init --recursive`
 * Ensure you have a working Clang toolchain that can build wasm
    * If running on Linux: `npm run setup-wasi-sdk`
    * Otherwise you can install https://github.com/WebAssembly/wasi-sdk and `export wasisdkroot=/path/to/wasi-sdk`
 * (For testing only) Ensure you have `xz` and `brotli` available as commands on $PATH
 * Run `make`

### Building the NPM package contents

 * Have `node` installed
 * `npm install`
 * Run `make package`

### Running scenario/perf tests

 * Have `node` installed
 * `npm install -g http-server`
 * `make run-sample`
