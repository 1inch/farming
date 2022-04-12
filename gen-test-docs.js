#!/usr/bin/env node

/*
  Usage:
  1. Add source files for docs generation to `filesForGen` array. The order matters.
  2. Set output file relative path in `outputFile`
  3. Execute "node gen-test-docs.js"
*/

// Settings
const filesForGen = [
    'test/ERC20Farmable.js',
    'test/behaviors/ERC20Farmable.behavior.js',
    'test/FarmingPool.js',
];

const outputMdFile = 'TESTS.md';
const includeCode = false;
const listOnly = false;

// Script
const acquitMd = require('acquit')();
const acquitJson = require('acquit')();
const fs = require('fs');
require('acquit-markdown')(acquitMd, { code: includeCode, it: true });

const legend = {};
let content;
let markdown = '';
let legendMd = '';

filesForGen.forEach((file) => {
    content = fs.readFileSync(file).toString();
    legend.blocks = acquitJson.parse(content);
    legend.contents = file;
    legendMd += buildLegend(legend, 1, listOnly);
    markdown += acquitMd.parse(content).toString();
    markdown += '\n';
});

content = listOnly ? legendMd : legendMd + markdown;

fs.writeFileSync(outputMdFile, content);
console.log('done');

function buildLegend (block, depth, listOnly) {
    // console.log(depth, block.contents);
    const url = (block.contents == null)
        ? ''
        : block.contents.toLowerCase().trim()
            .split(' ').join('-')
            .split(/,|\+|\/|:|\(|\)/).join('')
            .replace('--', '-');
    let legend = listOnly
        ? Array(depth).join('    ') + '* ' + block.contents + '\n'
        : Array(depth).join('    ') + '* [' + block.contents + '](#' + url + ')\n';
    if (block.blocks) {
        legend += block.blocks.map(function (child) {
            return buildLegend(child, depth + 1, listOnly);
        }).join('');
    }
    return legend;
}
