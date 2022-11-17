const { ethers } = require('hardhat');

function almostEqual (expected, actual) {
    this.assert(
        expected === actual ||
        expected + 1n === actual || expected + 2n === actual ||
        actual + 1n === expected || actual + 2n === expected,
        'expected #{act} to be almost equal #{exp}',
        'expected #{act} to be different from #{exp}',
        expected.toString(),
        actual.toString(),
    );
};

async function startFarming (farm, amount, period, from) {
    const tx = await farm.connect(from).startFarming(amount, period);
    const receipt = await tx.wait();
    return (await ethers.provider.getBlock(receipt.blockHash)).timestamp;
};

async function startMultiFarming (multiFarm, rewardsToken, amount, period, from) {
    const tx = await multiFarm.connect(from).startFarming(rewardsToken, amount, period);
    const receipt = await tx.wait();
    return (await ethers.provider.getBlock(receipt.blockHash)).timestamp;
};

async function joinNewFarms (erc20farmableToken, farmsCount, from) {
    for (let i = 0; i < farmsCount; i++) {
        const TokenMock = await ethers.getContractFactory('TokenMock');
        const gift = await TokenMock.deploy('GIFT', 'GIFT');
        await gift.deployed();
        const FarmingPod = await ethers.getContractFactory('FarmingPod');
        const farm = await FarmingPod.deploy(erc20farmableToken.address, gift.address);
        await farm.deployed();
        await erc20farmableToken.connect(from).addPod(farm.address);
    }
};

module.exports = {
    almostEqual,
    startFarming,
    startMultiFarming,
    joinNewFarms,
};
