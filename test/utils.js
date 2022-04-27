const { time } = require('@openzeppelin/test-helpers');
const { toBN } = require('@1inch/solidity-utils');

const Farm = artifacts.require('Farm');
const TokenMock = artifacts.require('TokenMock');

const timeIncreaseTo = async (seconds) => {
    const delay = 10 - new Date().getMilliseconds();
    await new Promise(resolve => setTimeout(resolve, delay));
    await time.increaseTo(seconds);
};

const almostEqual = function (expected, actual) {
    this.assert(
        expected.eq(actual) ||
        expected.addn(1).eq(actual) || expected.addn(2).eq(actual) ||
        actual.addn(1).eq(expected) || actual.addn(2).eq(expected),
        'expected #{act} to be almost equal #{exp}',
        'expected #{act} to be different from #{exp}',
        expected.toString(),
        actual.toString(),
    );
};

const startFarming = async (farm, amount, period, from) => {
    const tx = await farm.startFarming(amount, period, { from });
    return toBN((await web3.eth.getBlock(tx.receipt.blockHash)).timestamp);
};

const joinNewFarms = async (erc20farmableToken, amount, from) => {
    for (let i = 0; i < amount; i++) {
        const gift = await TokenMock.new('GIFT', 'GIFT', '0');
        const farm = await Farm.new(erc20farmableToken.address, gift.address);
        await erc20farmableToken.join(farm.address, { from });
    }
};

module.exports = {
    timeIncreaseTo,
    almostEqual,
    startFarming,
    joinNewFarms,
};
