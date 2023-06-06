const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    mode: 'none',
    entry: {
        'xz-decompress': './src/xz-decompress.js',
        'xz-decompress.min': './src/xz-decompress.js',
    },
    devtool: false,
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist/package'),
        library: 'xz-decompress',
        libraryTarget: 'umd',
        globalObject: 'this'
    },
    externals: [
        'stream/web'
    ],
    module: {
        rules: [{
            test: /\.wasm/,
            type: 'asset/inline'
        }]
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({ include: /\.min\.js$/, extractComments: false })]
    },
    plugins: [
        new webpack.BannerPlugin({
            banner: ''
                + 'Based on xzwasm (c) Steve Sanderson. License: MIT - https://github.com/SteveSanderson/xzwasm\n'
                + 'Contains xz-embedded by Lasse Collin and Igor Pavlov. License: Public domain - https://tukaani.org/xz/embedded.html\n'
                + 'and walloc (c) 2020 Igalia, S.L. License: MIT - https://github.com/wingo/walloc'
        })
    ]
}
