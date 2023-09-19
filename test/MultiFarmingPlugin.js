const { constants, expect, time, ether } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { startMultiFarming } = require('./utils');
const { Typed } = require('ethers');

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

    describe('rescueFunds', function () {
        it('should transfer remaining reward tokens from farm to wallet', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const duration = BigInt(60 * 60 * 24);
            const amount = 1000n;
            await multiFarm.startFarming(gift, amount, duration);
            const timestamp = (await multiFarm.farmInfo(gift)).finished - duration / 2n;
            await time.increaseTo(timestamp);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(multiFarm);
            const finishedBefore = (await multiFarm.farmInfo(gift)).finished;

            const distributor = await multiFarm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await multiFarm.rescueFunds(gift);

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount / 2n);
            expect(await gift.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore - amount / 2n);
            expect((await multiFarm.farmInfo(gift)).reward).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).duration).to.be.equal(0);
            expect((await multiFarm.farmInfo(gift)).finished).to.be.gte(timestamp).lt(finishedBefore);
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
            const tx = await multiFarm.rescueFunds(constants.ZERO_ADDRESS);
            const receipt = await tx.wait();
            const txCost = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(wallet1)).to.equal(balanceWalletBefore - txCost + balanceFarmBefore);
            expect(await ethers.provider.getBalance(multiFarm)).to.equal(0);
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
            await multiFarm.rescueFunds(token);

            expect(await token.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await token.balanceOf(multiFarm)).to.be.equal(balanceFarmBefore - amount);
            expect((await multiFarm.farmInfo(gift)).reward).to.be.equal(farmInfoBefore.reward);
            expect((await multiFarm.farmInfo(gift)).duration).to.be.equal(farmInfoBefore.duration);
            expect((await multiFarm.farmInfo(gift)).finished).to.be.equal(farmInfoBefore.finished);
        });
    });

    describe('withdrawable', function () {
        it('should calculate correct withdrawable amount of tokens', async function () {
            const { gifts, token, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const amount = 100n;
            await token.mint(multiFarm, amount);
            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, 1000n, duration);

            expect(await multiFarm.withdrawable(token)).to.be.equal(amount);

            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);
            expect(await multiFarm.withdrawable(token)).to.be.equal(amount);
        });

        it('should calculate correct withdrawable amount of ethers', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const amount = 100n;

            // Transfer ethers to farm
            const EthTransferMock = await ethers.getContractFactory('EthTransferMock');
            const ethMock = await EthTransferMock.deploy(multiFarm, { value: amount });
            await ethMock.waitForDeployment();

            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, 1000n, duration);

            expect(await multiFarm.withdrawable(constants.ZERO_ADDRESS)).to.be.equal(amount);

            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);
            expect(await multiFarm.withdrawable(constants.ZERO_ADDRESS)).to.be.equal(amount);
        });

        it('should calculate correct withdrawable amount of reward tokens', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const farmingAmount = 1000n;
            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, farmingAmount, duration);

            expect(await multiFarm.withdrawable(gift)).to.be.equal(farmingAmount);

            await time.increaseTo((await multiFarm.farmInfo(gift)).finished - duration / 2n);
            expect(await multiFarm.withdrawable(gift)).to.be.equal(farmingAmount / 2n);
        });

        it('should calculate correct withdrawable amount of reward tokens at the specified timestamp', async function () {
            const { gifts, multiFarm } = await loadFixture(initContracts);
            const gift = gifts[0];
            const farmingAmount = 1000n;
            const duration = BigInt(60 * 60 * 24);
            await multiFarm.startFarming(gift, farmingAmount, duration);
            const farmInfo = await multiFarm.farmInfo(gift);

            // 0% of farming duration
            let timestamp = farmInfo.finished - duration;
            expect(await multiFarm.withdrawable(gift, Typed.uint256(timestamp))).to.be.equal(farmingAmount);

            // 25% of farming duration
            timestamp += duration / 4n;
            expect(await multiFarm.withdrawable(gift, Typed.uint256(timestamp))).to.be.equal(farmingAmount * 3n / 4n);

            // 75% of farming duration
            timestamp += duration / 2n;
            expect(await multiFarm.withdrawable(gift, Typed.uint256((timestamp)))).to.be.equal(farmingAmount / 4n);

            // 100% of farming duration
            timestamp += duration / 4n;
            expect((await multiFarm.farmInfo(gift)).finished).to.be.equal(timestamp);
            expect(await multiFarm.withdrawable(gift, Typed.uint256(timestamp))).to.be.equal(0);
        });
    });
});
