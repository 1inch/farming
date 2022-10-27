const { time } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { BigNumber: BN } = require('ethers');

async function timeIncreaseTo (seconds) {
    const delay = 10 - new Date().getMilliseconds();
    await new Promise(resolve => setTimeout(resolve, delay));
    await time.increaseTo(seconds);
};

function almostEqual (expected, actual) {
    this.assert(
        expected.eq(actual) ||
        expected.add(1).eq(actual) || expected.add(2).eq(actual) ||
        actual.add(1).eq(expected) || actual.add(2).eq(expected),
        'expected #{act} to be almost equal #{exp}',
        'expected #{act} to be different from #{exp}',
        expected.toString(),
        actual.toString(),
    );
};

async function startFarming (farm, amount, period, from) {
    const tx = await farm.connect(from).startFarming(amount, period);
    const receipt = await tx.wait();
    return BN.from((await ethers.provider.getBlock(receipt.blockHash)).timestamp);
};

async function joinNewFarms (erc20farmableToken, farmsCount, from) {
    for (let i = 0; i < farmsCount; i++) {
        const TokenMock = await ethers.getContractFactory('TokenMock');
        const gift = await TokenMock.deploy('GIFT', 'GIFT');
        await gift.deployed();
        const Farm = await ethers.getContractFactory('Farm');
        const farm = await Farm.deploy(erc20farmableToken.address, gift.address);
        await farm.deployed();
        await erc20farmableToken.connect(from).join(farm.address);
    }
};

module.exports = {
    timeIncreaseTo,
    almostEqual,
    startFarming,
    joinNewFarms,
};
