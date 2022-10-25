const { time } = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { BigNumber: BN } = require('ethers');

const timeIncreaseTo = async (seconds) => {
    const delay = 10 - new Date().getMilliseconds();
    await new Promise(resolve => setTimeout(resolve, delay));
    await time.increaseTo(seconds);
};

const almostEqual = function (expected, actual) {
    this.assert(
        expected.eq(actual) ||
        expected.add(1).equal(actual) || expected.add(2).equal(actual) ||
        actual.add(1).equal(expected) || actual.add(2).equal(expected),
        'expected #{act} to be almost equal #{exp}',
        'expected #{act} to be different from #{exp}',
        expected.toString(),
        actual.toString(),
    );
};

const startFarming = async (farm, amount, period, from) => {
    const tx = await farm.connect(from).startFarming(amount, period);
    return BN.from((await ethers.provider.getBlock(tx.receipt.blockHash)).timestamp);
};

const joinNewFarms = async (erc20farmableToken, amount, from) => {
    for (let i = 0; i < amount; i++) {
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
