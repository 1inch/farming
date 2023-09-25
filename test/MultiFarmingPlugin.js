const { expect, time, ether } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { startMultiFarming } = require('./utils');

describe('MultiFarmingPlugin', function () {
    let wallet1, wallet2, wallet3;
    const INITIAL_SUPPLY = ether('1');
    const MAX_USER_FARMS = 10;
    const MAX_PLUGIN_GAS_LIMIT = 200_000;
    const REWARDS_TOKENS_LIMITS = 5;

    before(async function () {
        [wallet1, wallet2, wallet3] = await ethers.getSigners();
    });

    async function initContracts () {
        const ERC20FarmableMock = await ethers.getContractFactory('ERC20PluginsMock');
        const token = await ERC20FarmableMock.deploy('1INCH', '1INCH', MAX_USER_FARMS, MAX_PLUGIN_GAS_LIMIT);
        await token.waitForDeployment();
        await token.mint(wallet1, INITIAL_SUPPLY);

        const gifts = [];
        const TokenMock = await ethers.getContractFactory('TokenMock');
        gifts[0] = await TokenMock.deploy('USDC', 'USDC');
        gifts[0].waitForDeployment();
        gifts[1] = await TokenMock.deploy('USDT', 'USDT');
        gifts[1].waitForDeployment();
        const MultiFarmingPlugin = await ethers.getContractFactory('MultiFarmingPlugin');
        const multiFarm = await MultiFarmingPlugin.deploy(token, REWARDS_TOKENS_LIMITS);
        await multiFarm.waitForDeployment();
        await multiFarm.addRewardsToken(gifts[0]);

        for (const wallet of [wallet1, wallet2, wallet3]) {
            for (const gift of gifts) {
                await gift.mint(wallet, '1000000000');
                await gift.connect(wallet).approve(multiFarm, '1000000000');
            }
        }
        await multiFarm.setDistributor(wallet1);
        return { token, gifts, multiFarm };
    };

    describe('farmed', function () {
        it('should farmed tokens from both farms', async function () {
            const { token, gifts, multiFarm } = await loadFixture(initContracts);
            await token.addPlugin(multiFarm);
            await gifts[0].connect(wallet2).transfer(multiFarm, '1000');
            await gifts[1].connect(wallet2).transfer(multiFarm, '1000');

            // Start farming with 1 gift token
            const period = 60 * 60 * 24;
            const rewardAmount = 1000;

            const started = await startMultiFarming(multiFarm, gifts[0], rewardAmount, period, wallet1);

            // Start farming with gifts[1] token and check that farmed gifts is equal to amount after period
            await time.increaseTo(started + period / 2 - 2);
            await multiFarm.addRewardsToken(gifts[1]);
            await startMultiFarming(multiFarm, gifts[1], rewardAmount, period, wallet1);

            // Check that farmed gifts[0] is equal to half of amount after half of period
            expect(await multiFarm.farmed(gifts[0], wallet1)).to.equal(rewardAmount / 2);
            expect(await multiFarm.farmed(gifts[1], wallet1)).to.equal(0);
            await time.increaseTo(started + period);
            expect(await multiFarm.farmed(gifts[0], wallet1)).to.equal(rewardAmount);
            expect(await multiFarm.farmed(gifts[1], wallet1)).to.equal(rewardAmount / 2);
        });

        it('should show farming parameters for both tokens', async function () {
            const { token, gifts, multiFarm } = await loadFixture(initContracts);
            await token.addPlugin(multiFarm);
            await gifts[0].connect(wallet2).transfer(multiFarm, '1000');
            await gifts[1].connect(wallet2).transfer(multiFarm, '1000');

            // Start farming with 1 gift token
            const period = 60 * 60 * 24;
            const rewardAmount = 1000;

            const startedGift0 = await startMultiFarming(multiFarm, gifts[0], rewardAmount, period, wallet1);

            // Start farming with gifts[1] token and check that farmed gifts is equal to amount after period
            await time.increaseTo(startedGift0 + period / 2 - 2);
            await multiFarm.addRewardsToken(gifts[1]);
            const startedGift1 = await startMultiFarming(multiFarm, gifts[1], rewardAmount, period, wallet1);

            const farmInfo0 = await multiFarm.farmInfo(gifts[0]);
            expect(farmInfo0.duration).to.be.equal(period);
            expect(farmInfo0.finished).to.be.equal(startedGift0 + period);
            expect(farmInfo0.reward).to.be.equal(rewardAmount);

            const farmInfo1 = await multiFarm.farmInfo(gifts[1]);
            expect(farmInfo1.duration).to.be.equal(period);
            expect(farmInfo1.finished).to.be.equal(startedGift1 + period);
            expect(farmInfo1.reward).to.be.equal(rewardAmount);
        });
    });

    describe('stopFarming', function () {
        it('should transfer remaining reward tokens from farm to wallet', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            const amount = 500n;
            await multiFarm.startFarming(gift, 1000, duration);
            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(multiFarm);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await multiFarm.stopFarming(gift);

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await gift.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore - amount);
            expect((await multiFarm.farmInfo(gift)).reward).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).duration).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).finished).to.be.equal(await time.latest());
        });
    });

    describe('rescueFunds', function () {
        it('should thrown with insufficient funds', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, 1000, duration);
            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(multiFarm);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await expect(multiFarm.rescueFunds(gift, '1000')).to.be.revertedWithCustomError(multiFarm, 'InsufficientFunds');

            expect(await gift.balanceOf(wallet1)).to.equal(balanceWalletBefore);
            expect(await gift.balanceOf(multiFarm)).to.equal(balanceFarmBefore);
        });

        it('should transfer all tokens from farm to wallet during farming', async function () {
            const { token, gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            const amount = 100n;
            await token.mint(multiFarm, amount);
            await multiFarm.startFarming(gift, 1000, duration);
            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);

            const balanceWalletBefore = await token.balanceOf(wallet1);
            const balanceFarmBefore = await token.balanceOf(multiFarm);
            const farmInfoBefore = await multiFarm.farmInfo(gift);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await multiFarm.rescueFunds(token, amount);

            expect(await token.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await token.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore - amount);
            expect((await multiFarm.farmInfo(gift)).reward).to.be.equal(farmInfoBefore.reward);
            expect((await multiFarm.farmInfo(gift)).duration).to.be.equal(farmInfoBefore.duration);
            expect((await multiFarm.farmInfo(gift)).finished).to.be.equal(farmInfoBefore.finished);
        });
    });
});
