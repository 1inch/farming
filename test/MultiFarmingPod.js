const { expect, time, ether } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { startMultiFarming } = require('./utils');

describe('MultiFarmingPod', function () {
    let wallet1, wallet2, wallet3;
    const INITIAL_SUPPLY = ether('1');
    const MAX_USER_FARMS = 10;
    const REWARDS_TOKENS_LIMITS = 5;

    before(async function () {
        [wallet1, wallet2, wallet3] = await ethers.getSigners();
    });

    async function initContracts () {
        const ERC20FarmableMock = await ethers.getContractFactory('ERC20PodsMock');
        const token = await ERC20FarmableMock.deploy('1INCH', '1INCH', MAX_USER_FARMS);
        await token.deployed();
        await token.mint(wallet1.address, INITIAL_SUPPLY);

        const gifts = [];
        const TokenMock = await ethers.getContractFactory('TokenMock');
        gifts[0] = await TokenMock.deploy('USDC', 'USDC');
        gifts[0].deployed();
        gifts[1] = await TokenMock.deploy('USDT', 'USDT');
        gifts[1].deployed();
        const MultiFarmingPod = await ethers.getContractFactory('MultiFarmingPod');
        const multiFarm = await MultiFarmingPod.deploy(token.address, gifts[0].address, REWARDS_TOKENS_LIMITS);
        await multiFarm.deployed();

        for (const wallet of [wallet1, wallet2, wallet3]) {
            for (const gift of gifts) {
                await gift.mint(wallet.address, '1000000000');
                await gift.connect(wallet).approve(multiFarm.address, '1000000000');
            }
        }
        await multiFarm.setDistributor(wallet1.address);
        return { token, gifts, multiFarm };
    };

    describe('farmed', function () {
        it('should farmed tokens from both farms', async function () {
            const { token, gifts, multiFarm } = await loadFixture(initContracts);
            await token.addPod(multiFarm.address);
            await gifts[0].connect(wallet2).transfer(multiFarm.address, '1000');
            await gifts[1].connect(wallet2).transfer(multiFarm.address, '1000');

            // Start farming with 1 gift token
            const period = 60 * 60 * 24;
            const rewardAmount = 1000;

            const started = await startMultiFarming(multiFarm, gifts[0].address, rewardAmount, period, wallet1);

            // Start farming with gifts[1] token and check that farmed gifts is equal to amout after period
            await time.increaseTo(started + period / 2 - 2);
            await multiFarm.addRewardsToken(gifts[1].address);
            await startMultiFarming(multiFarm, gifts[1].address, rewardAmount, period, wallet1);

            // Check that farmed gifts[0] is equal to half of amount after half of period
            expect(await multiFarm.farmed(gifts[0].address, wallet1.address)).to.equal(rewardAmount / 2);
            expect(await multiFarm.farmed(gifts[1].address, wallet1.address)).to.equal(0);
            await time.increaseTo(started + period);
            expect(await multiFarm.farmed(gifts[0].address, wallet1.address)).to.equal(rewardAmount);
            expect(await multiFarm.farmed(gifts[1].address, wallet1.address)).to.equal(rewardAmount / 2);
        });
    });
});
