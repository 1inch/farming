const { constants, time, ether } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { startMultiFarming } = require('./utils');

describe('MultiFarmingPlugin', function () {
    let wallet1, wallet2, wallet3;
    const INITIAL_SUPPLY = ether('1');
    const MAX_USER_FARMS = 10;
    const MAX_HOOK_GAS_LIMIT = 200_000;
    const REWARDS_TOKENS_LIMITS = 5;

    before(async function () {
        [wallet1, wallet2, wallet3] = await ethers.getSigners();
    });

    async function initContracts () {
        const ERC20FarmableMock = await ethers.getContractFactory('ERC20HooksMock');
        const token = await ERC20FarmableMock.deploy('1INCH', '1INCH', MAX_USER_FARMS, MAX_HOOK_GAS_LIMIT);
        await token.waitForDeployment();
        await token.mint(wallet1, INITIAL_SUPPLY);

        const gifts = [];
        const TokenMock = await ethers.getContractFactory('TokenMock');
        gifts[0] = await TokenMock.deploy('USDC', 'USDC');
        gifts[0].waitForDeployment();
        gifts[1] = await TokenMock.deploy('USDT', 'USDT');
        gifts[1].waitForDeployment();
        const MultiFarmingPlugin = await ethers.getContractFactory('MultiFarmingPlugin');
        const multiFarm = await MultiFarmingPlugin.deploy(token, REWARDS_TOKENS_LIMITS, wallet1);
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
            await token.addHook(multiFarm);
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
            expect(await multiFarm.farmed(gifts[0], wallet1)).to.equal(BigInt(rewardAmount / 2));
            expect(await multiFarm.farmed(gifts[1], wallet1)).to.equal(0n);
            await time.increaseTo(started + period);
            expect(await multiFarm.farmed(gifts[0], wallet1)).to.equal(BigInt(rewardAmount));
            expect(await multiFarm.farmed(gifts[1], wallet1)).to.equal(BigInt(rewardAmount / 2));
        });

            it('should show farming parameters for both tokens', async function () {
                const { token, gifts, multiFarm } = await loadFixture(initContracts);
                await token.addHook(multiFarm);
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
            expect(farmInfo0.duration).to.be.equal(BigInt(period));
            expect(farmInfo0.finished).to.be.equal(BigInt(startedGift0 + period));
            expect(farmInfo0.reward).to.be.equal(BigInt(rewardAmount));

            const farmInfo1 = await multiFarm.farmInfo(gifts[1]);
            expect(farmInfo1.duration).to.be.equal(BigInt(period));
            expect(farmInfo1.finished).to.be.equal(BigInt(startedGift1 + period));
            expect(farmInfo1.reward).to.be.equal(BigInt(rewardAmount));
        });
    });

    describe('stopFarming', function () {
        it('should thrown with access denied', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const distributor = await multiFarm.distributor();
            expect(wallet2).to.not.equal(distributor);
            await expect(
                multiFarm.connect(wallet2).stopFarming(gift),
            ).to.be.revertedWithCustomError(multiFarm, 'NotDistributor');
        });

        it('should be reverted because of an invalid reward token', async function () {
            const { token, multiFarm } = await loadFixture(initContracts);
            const distributor = await multiFarm.distributor();
            expect(wallet2).to.not.equal(distributor);
            await expect(
                multiFarm.stopFarming(token),
            ).to.be.revertedWithCustomError(multiFarm, 'RewardsTokenNotFound');
        });

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

        it('should transfer 0 reward tokens from farm to wallet after farming is finished', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, 1000, duration);
            await time.increaseTo((await multiFarm.farmInfo(gift)).finished + 1n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(multiFarm);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await multiFarm.stopFarming(gift);

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore);
            expect(await gift.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore);
            expect((await multiFarm.farmInfo(gift)).reward).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).duration).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).finished).to.be.equal(await time.latest());
        });
    });

    describe('rescueFunds', function () {
        it('should thrown with access denied', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const distributor = await multiFarm.distributor();
            expect(wallet2).to.not.equal(distributor);
            await expect(
                multiFarm.connect(wallet2).rescueFunds(gift, '1000'),
            ).to.be.revertedWithCustomError(multiFarm, 'NotDistributor');
        });

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

        it('should transfer ethers from farm to wallet', async function () {
            const { multiFarm } = await loadFixture(initContracts);
            // Transfer ethers to farm
            const EthTransferMock = await ethers.getContractFactory('EthTransferMock');
            const ethMock = await EthTransferMock.deploy(multiFarm, { value: '1000' });
            await ethMock.waitForDeployment();

            // Check rescueFunds
            const balanceWalletBefore = await ethers.provider.getBalance(wallet1);
            const balanceFarmBefore = await ethers.provider.getBalance(multiFarm);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            const tx = await multiFarm.rescueFunds(constants.ZERO_ADDRESS, '1000');
            const receipt = await tx.wait();
            const txCost = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(wallet1)).to.equal(balanceWalletBefore - txCost + 1000n);
            expect(await ethers.provider.getBalance(multiFarm)).to.equal(balanceFarmBefore - 1000n);
        });

        it('should transfer all extra reward tokens from farm to wallet during farming', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            const amount = 100n;
            await gift.mint(multiFarm, amount);
            await multiFarm.startFarming(gift, 1000, duration);
            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(multiFarm);

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await multiFarm.rescueFunds(gift, amount);

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await gift.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore - amount);
        });
    });
});
