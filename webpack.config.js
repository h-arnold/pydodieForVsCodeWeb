/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'webworker',
  entry: {
    extension: './src/web/extension.ts',
    'pyodide.worker': './src/web/pyodideWorker.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'web'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../../[resource-path]',
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    extensions: ['.ts', '.js'],
    alias: {
      path: 'path-browserify',
    },
    fallback: {
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      fs: false,
      child_process: false,
      net: false,
      crypto: false,
      http: false,
      https: false,
      zlib: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'esnext',
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};

module.exports = config;
