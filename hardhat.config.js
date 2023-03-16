require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('@nomicfoundation/hardhat-chai-matchers');
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
        version: '0.8.19',
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            viaIR: true,
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
            '@1inch/erc20-pods/contracts/mocks/ERC20PodsMock.sol',
        ],
    },
};
