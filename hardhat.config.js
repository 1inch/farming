require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-truffle5');
require('dotenv').config();
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('solidity-coverage');

const networks = require('./hardhat.networks');

module.exports = {
    etherscan: {
        apiKey: {
            mainnet: process.env.MAINNET_ETHERSCAN_KEY,
            avalanche: process.env.AVAX_ETHERSCAN_KEY,
        },
    },
    solidity: {
        version: '0.8.12',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
        },
    },
    networks,
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    gasReporter: {
        enable: true,
        currency: 'USD',
    },
    dependencyCompiler: {
        paths: [
            '@1inch/solidity-utils/contracts/mocks/TokenMock.sol',
        ],
    },
};
