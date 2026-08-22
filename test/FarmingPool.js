const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { constants, time } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { almostEqual, startFarming } = require('./utils');

require('chai').use(function (chai, utils) {
    chai.Assertion.addMethod('almostEqual', function (expected) {
        almostEqual.call(this, expected, this._obj);
    });
});

describe('FarmingPool', function () {
    let wallet1, wallet2, wallet3;
    let TokenMock;
    let FarmingPool;
    let EthTransferMock;

    before(async function () {
        [wallet1, wallet2, wallet3] = await ethers.getSigners();
        TokenMock = await ethers.getContractFactory('TokenMock');
        FarmingPool = await ethers.getContractFactory('FarmingPool');
        EthTransferMock = await ethers.getContractFactory('EthTransferMock');
    });

    async function initContracts () {
        const token = await TokenMock.deploy('1INCH', '1INCH');
        await token.waitForDeployment();
        const gift = await TokenMock.deploy('UDSC', 'USDC');
        await gift.waitForDeployment();
        const regularToken = await TokenMock.deploy('USDT', 'USDT');
        await regularToken.waitForDeployment();
        const farm = await FarmingPool.deploy(token, gift, wallet1);
        await farm.waitForDeployment();

        for (const wallet of [wallet1, wallet2, wallet3]) {
            await token.mint(wallet, '1000000000');
            await gift.mint(wallet, '1000000000');
            await token.connect(wallet).approve(farm, '1000000000');
            await gift.connect(wallet).approve(farm, '1000000000');
        }

        await farm.setDistributor(wallet1);
        return { token, gift, regularToken, farm };
    };

    describe('startFarming', function () {
        it('should thrown with rewards distribution access denied ', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(
                farm.connect(wallet2).startFarming(1000, 60 * 60 * 24),
            ).to.be.revertedWithCustomError(farm, 'NotDistributor');
        });

        it('should rescue extra gift tokens from farm in the case of overlapping farming', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const duration = BigInt(60 * 60 * 24);
            const amount = 100n;
            await gift.mint(farm, amount);
            await farm.startFarming(1000, duration);
            await time.increaseTo((await farm.farmInfo()).finished - duration / 2n);
            await farm.startFarming(1000, duration);
            await farm.stopFarming();
            const farmInfoBefore = await farm.farmInfo();
            console.log(`farmBalance = ${await gift.balanceOf(farm)}, farmInfo.reward = ${farmInfoBefore.reward}, farmInfo.balance = ${farmInfoBefore.balance}`);
            // Shouldn't revert with InsufficientFunds
            await farm.rescueFunds(gift, amount);
            const farmInfoAfter = await farm.farmInfo();
            console.log(`farmBalance = ${await gift.balanceOf(farm)}, farmInfo.reward = ${farmInfoAfter.reward}, farmInfo.balance = ${farmInfoAfter.balance}`);
        });
    });

    describe('name', function () {
        it('should be return name', async function () {
            const { token, farm } = await loadFixture(initContracts);
            expect(await farm.name()).to.equal('Farming of ' + await token.name());
        });
    });

    describe('symbol', function () {
        it('should be return symbol', async function () {
            const { token, farm } = await loadFixture(initContracts);
            expect(await farm.symbol()).to.equal('farm' + await token.name());
        });
    });

    describe('decimals', function () {
        it('should be return decimals', async function () {
            const { token, farm } = await loadFixture(initContracts);
            expect(await farm.decimals()).to.equal(await token.decimals());
        });
    });

    describe('mint', function () {
        it('should be mint', async function () {
            const { farm } = await loadFixture(initContracts);
            await farm.deposit('1000');
            expect(await farm.balanceOf(wallet1)).to.equal(1000n);
            expect(await farm.totalSupply()).to.equal(1000n);
        });
    });

    describe('burn', function () {
        it('should be burn', async function () {
            const { farm } = await loadFixture(initContracts);
            await farm.deposit('1000');
            await farm.withdraw('999');
            expect(await farm.balanceOf(wallet1)).to.equal(1n);
            expect(await farm.totalSupply()).to.equal(1n);
        });

        it('should be thrown', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(farm.withdraw('1')).to.be.revertedWithCustomError(farm, 'ERC20InsufficientBalance');
        });
    });

    describe('deposit', function () {
        it('Two stakers with the same stakes wait 1 w', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('1');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await time.increaseTo(started + time.duration.weeks(1));

            // expect(await farm.farmedPerToken()).to.almostEqual('36000');
            expect(await farm.farmed(wallet1)).to.almostEqual(36000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(36000n);
        });

        it('Two stakers with the different (1:3) stakes wait 1 w', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1)).to.equal(0n);
            expect(await farm.balanceOf(wallet2)).to.equal(0n);
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await time.increaseTo(started + time.duration.weeks(1));

            // expect(await farm.farmedPerToken()).to.almostEqual('18000');
            expect(await farm.farmed(wallet1)).to.almostEqual(18000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(54000n);
        });

        it('Two stakers with the different (1:3) stakes wait 2 weeks', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +----------------+ = 72k for 1w + 18k for 2w
            // 3x:         +--------+ =  0k for 1w + 54k for 2w
            //

            // 72000 UDSC per week
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await time.increaseTo(started + time.duration.weeks(1));

            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.almostEqual('72000');
            expect(await farm.farmed(wallet1)).to.almostEqual(72000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(0n);

            await farm.startFarming('72000', time.duration.weeks(1));
            await time.increaseTo(started + time.duration.weeks(2));

            // expect(await farm.farmedPerToken()).to.almostEqual('90000');
            expect(await farm.farmed(wallet1)).to.almostEqual(90000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(54000n);
        });

        it('One staker on 1st and 3rd weeks farming with gap', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await time.increaseTo(started + time.duration.weeks(1));

            expect(await farm.farmed(wallet1)).to.almostEqual(72000n);

            await time.increaseTo(started + time.duration.weeks(2));

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await time.increaseTo(started + time.duration.weeks(3));

            expect(await farm.farmed(wallet1)).to.almostEqual(144000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(0n);
        });

        it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await time.increaseTo(started + time.duration.weeks(1));

            expect(await farm.farmed(wallet1)).to.almostEqual(72000n);
            await farm.claim();
            expect(await farm.farmed(wallet1)).to.almostEqual(0n);

            await time.increaseTo(started + time.duration.weeks(2));

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await time.increaseTo(started + time.duration.weeks(3));

            expect(await farm.farmed(wallet1)).to.almostEqual(72000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(0n);
        });

        it('Three stakers with the different (1:3:5) stakes wait 3 weeks + 1 second', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
            // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
            // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            await time.increaseTo(started + time.duration.weeks(1) + 1);

            await farm.connect(wallet3).deposit('5');

            expect(await farm.farmed(wallet1)).to.almostEqual(18000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(54000n);
            expect(await farm.farmed(wallet3)).to.almostEqual(0n);
        });

        it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
            // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
            // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            await time.increaseTo(started + time.duration.weeks(1));

            await farm.connect(wallet3).deposit('5');

            // expect(await farm.farmedPerToken()).to.almostEqual('18000');
            expect(await farm.farmed(wallet1)).to.almostEqual(18000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(54000n);

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await time.increaseTo(started + time.duration.weeks(2));

            // expect(await farm.farmedPerToken()).to.almostEqual('26000'); // 18k + 8k
            expect(await farm.farmed(wallet1)).to.almostEqual(26000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(78000n);
            expect(await farm.farmed(wallet3)).to.almostEqual(40000n);

            await farm.connect(wallet2).exit();

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await time.increaseTo(started + time.duration.weeks(3));

            // expect(await farm.farmedPerToken()).to.almostEqual('38000'); // 18k + 8k + 12k
            expect(await farm.farmed(wallet1)).to.almostEqual(38000n);
            expect(await farm.farmed(wallet2)).to.almostEqual(0n);
            expect(await farm.farmed(wallet3)).to.almostEqual(100000n);
        });

        it('One staker on 2 durations with gap', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await time.increaseTo(started + time.duration.weeks(2));

            // expect(await farm.farmedPerToken()).to.almostEqual('72000');
            expect(await farm.farmed(wallet1)).to.almostEqual(72000n);

            // 72000 UDSC per week for 1 weeks
            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await time.increaseTo(started + time.duration.weeks(3));

            // expect(await farm.farmedPerToken()).to.almostEqual('144000');
            expect(await farm.farmed(wallet1)).to.almostEqual(144000n);
        });

        it('Notify Reward Amount from mocked distribution to 10,000', async function () {
            const { farm } = await loadFixture(initContracts);
            // 10000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '10000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1)).to.equal(0n);
            expect(await farm.balanceOf(wallet2)).to.equal(0n);
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            await time.increaseTo(started + time.duration.weeks(1));

            // expect(await farm.farmedPerToken()).to.almostEqual('2500');
            expect(await farm.farmed(wallet1)).to.almostEqual(2500n);
            expect(await farm.farmed(wallet2)).to.almostEqual(7500n);
        });

        it('Thrown with Period too large', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(
                farm.startFarming('10000', 2n ** 40n),
            ).to.be.revertedWithCustomError(farm, 'DurationTooLarge');
        });

        it('Thrown with Amount too large', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const largeAmount = 2n ** 192n;
            await gift.mint(wallet1, largeAmount);
            await gift.approve(farm, largeAmount);
            await expect(
                farm.startFarming(largeAmount, time.duration.weeks(1)),
            ).to.be.revertedWithCustomError(farm, 'AmountTooLarge');
        });

        it('Notify Reward Amount before prev farming finished', async function () {
            const { farm } = await loadFixture(initContracts);
            // 10000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '10000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1)).to.equal(0n);
            expect(await farm.balanceOf(wallet2)).to.equal(0n);
            expect(await farm.farmed(wallet1)).to.equal(0n);
            expect(await farm.farmed(wallet2)).to.equal(0n);

            // 1000 UDSC per week for 1 weeks
            await startFarming(farm, '1000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            await time.increaseTo(started + time.duration.weeks(1) + 2);

            // expect(await farm.farmedPerToken()).to.almostEqual('2750');
            expect(await farm.farmed(wallet1)).to.almostEqual(2750n);
            expect(await farm.farmed(wallet2)).to.almostEqual(8250n);
        });
    });

    describe('transfer', function () {
        const farmingAmount = 72000n;
        const wallet1Amount = 1n;
        const wallet2Amount = 3n;
        const wallet3Amount = 1n;

        it('should be correct farming after transfered from non-farm user to farm user', async function () {
            const { farm } = await loadFixture(initContracts);

            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount);
            await farm.connect(wallet2).deposit(wallet2Amount);

            await time.increaseTo(started + time.duration.weeks(1));

            // farmedWalletPerWeek = farmingAmount / 2 * wallet1Amount / (wallet1Amount + wallet2Amount)
            const farmedWallet1PerWeek = farmingAmount / 2n * wallet1Amount / (wallet1Amount + wallet2Amount);
            const farmedWallet2PerWeek = farmingAmount / 2n * wallet2Amount / (wallet1Amount + wallet2Amount);
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2PerWeek);
            expect(await farm.farmed(wallet3)).to.almostEqual(0n);

            await farm.connect(wallet3).deposit(wallet3Amount);
            await farm.connect(wallet3).transfer(wallet1, wallet3Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1);
            const balanceWallet2 = await farm.balanceOf(wallet2);
            const balanceWallet3 = await farm.balanceOf(wallet3);
            expect(balanceWallet1).to.equal(wallet1Amount + wallet3Amount);
            expect(balanceWallet2).to.equal(wallet2Amount);
            expect(balanceWallet3).to.equal(0n);

            await time.increaseTo(started + time.duration.weeks(2));

            // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            const farmedWallet1Per2Week = farmedWallet1PerWeek + (farmingAmount / 2n * balanceWallet1 / (balanceWallet1 + balanceWallet2));
            const farmedWallet2Per2Week = farmedWallet2PerWeek + (farmingAmount / 2n * balanceWallet2 / (balanceWallet1 + balanceWallet2));
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2Per2Week);
            expect(await farm.farmed(wallet3)).to.almostEqual(0n);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to non-farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount + wallet2Amount);

            await time.increaseTo(started + time.duration.weeks(1));

            const farmedWallet1PerWeek = farmingAmount / 2n;
            const farmedWallet2PerWeek = 0n;
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2PerWeek);

            await farm.transfer(wallet2, wallet2Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1);
            const balanceWallet2 = await farm.balanceOf(wallet2);
            expect(balanceWallet1).to.equal(wallet1Amount);
            expect(balanceWallet2).to.equal(wallet2Amount);

            await time.increaseTo(started + time.duration.weeks(2));

            const farmedWallet1Per2Week = farmedWallet1PerWeek + farmingAmount / 2n * balanceWallet1 / (balanceWallet1 + balanceWallet2);
            const farmedWallet2Per2Week = farmedWallet2PerWeek + farmingAmount / 2n * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from non-farm user to non-farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);

            await time.increaseTo(started + time.duration.weeks(1));

            expect(await farm.farmed(wallet1)).to.almostEqual(0n);
            expect(await farm.farmed(wallet2)).to.almostEqual(0n);

            await farm.deposit(wallet1Amount + wallet2Amount);
            await farm.transfer(wallet2, wallet2Amount);

            await time.increaseTo(started + time.duration.weeks(2));

            const farmedWallet1PerWeek = farmingAmount / 2n * wallet1Amount / (wallet1Amount + wallet2Amount);
            const farmedWallet2PerWeek = farmingAmount / 2n * wallet2Amount / (wallet1Amount + wallet2Amount);
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2PerWeek);
            console.log('farmed after week {wallet1, wallet2} = {0, 0}');
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount);
            await farm.connect(wallet2).deposit(wallet2Amount);

            await time.increaseTo(started + time.duration.weeks(1));

            const farmedWallet1PerWeek = farmingAmount / 2n * wallet1Amount / (wallet1Amount + wallet2Amount);
            const farmedWallet2PerWeek = farmingAmount / 2n * wallet2Amount / (wallet1Amount + wallet2Amount);
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2PerWeek);

            await farm.connect(wallet2).transfer(wallet1, wallet1Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1);
            const balanceWallet2 = await farm.balanceOf(wallet2);
            expect(balanceWallet1).to.equal(wallet1Amount + wallet1Amount);
            expect(balanceWallet2).to.equal(wallet2Amount - wallet1Amount);

            await time.increaseTo(started + time.duration.weeks(2));

            const farmedWallet1Per2Week = farmedWallet1PerWeek + farmingAmount / 2n * balanceWallet1 / (balanceWallet1 + balanceWallet2);
            const farmedWallet2Per2Week = farmedWallet2PerWeek + farmingAmount / 2n * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            expect(await farm.farmed(wallet1)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2)).to.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);

            expect(farmedWallet1Per2Week - farmedWallet1PerWeek).to.equal(farmedWallet2Per2Week - farmedWallet2PerWeek);
        });
    });

    describe('stopFarming', function () {
        it('should throw with access denied', async function () {
            const { farm } = await loadFixture(initContracts);
            const distributor = await farm.distributor();
            expect(wallet2.address).to.not.equal(distributor);
            await expect(
                farm.connect(wallet2).stopFarming(),
            ).to.be.revertedWithCustomError(farm, 'NotDistributor');
        });

        it('should transfer tokens from farm to wallet', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            await farm.startFarming(1000, time.duration.weeks(1));

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.stopFarming();

            expect(await gift.balanceOf(wallet1)).to.equal(balanceWalletBefore + 1000n);
            expect(await gift.balanceOf(farm)).to.equal(balanceFarmBefore - 1000n);
        });

        it('should transfer remaining reward tokens from farm to wallet', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const duration = BigInt(60 * 60 * 24);
            const amount = 500n;
            await farm.startFarming(1000, duration);
            await time.increaseTo((await farm.farmInfo()).finished - duration / 2n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.stopFarming();

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await gift.balanceOf(farm)).to.be.equal(balanceFarmBefore - amount);
            expect((await farm.farmInfo()).reward).to.be.equal(0);
            expect((await farm.farmInfo()).duration).to.be.equal(0);
            expect((await farm.farmInfo()).finished).to.be.equal(await time.latest());
        });

        it('should transfer 0 reward tokens from farm to wallet after farming is finished', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const duration = BigInt(60 * 60 * 24);
            await farm.startFarming(1000, duration);
            await time.increaseTo((await farm.farmInfo()).finished + 1n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.stopFarming();

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore);
            expect(await gift.balanceOf(farm)).to.be.equal(balanceFarmBefore);
            expect((await farm.farmInfo()).reward).to.be.equal(0);
            expect((await farm.farmInfo()).duration).to.be.equal(0);
            expect((await farm.farmInfo()).finished).to.be.equal(await time.latest());
        });
    });

    describe('rescueFunds', function () {
        it('should thrown with access denied', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const distributor = await farm.distributor();
            expect(wallet2.address).to.not.equal(distributor);
            await expect(
                farm.connect(wallet2).rescueFunds(gift, '1000'),
            ).to.be.revertedWithCustomError(farm, 'NotDistributor');
        });

        it('should thrown with not enough balance for staking token', async function () {
            const { token, farm } = await loadFixture(initContracts);
            await farm.deposit('1000');
            expect(await farm.totalSupply()).to.gt('0');

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await expect(
                farm.rescueFunds(token, '1000'),
            ).to.be.revertedWithCustomError(farm, 'InsufficientFunds');
        });

        it('should transfer staking token and leave balance of staking tokens more than (and equals to) totalBalance amount', async function () {
            const { token, farm } = await loadFixture(initContracts);
            await token.transfer(farm, '1000');
            await farm.deposit('1000');
            expect(await farm.totalSupply()).to.gt('0');

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.rescueFunds(token, '500');
            expect(await token.balanceOf(farm)).to.gt(await farm.totalSupply());

            await farm.rescueFunds(token, '500');
            expect(await token.balanceOf(farm)).to.equal(await farm.totalSupply());
        });

        it('should transfer ethers from farm to wallet', async function () {
            const { farm } = await loadFixture(initContracts);
            // Transfer ethers to farm
            const ethMock = await EthTransferMock.deploy(farm, { value: '1000' });
            await ethMock.waitForDeployment();

            // Check rescueFunds
            const balanceWalletBefore = await ethers.provider.getBalance(wallet1);
            const balanceFarmBefore = await ethers.provider.getBalance(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            const tx = await farm.rescueFunds(constants.ZERO_ADDRESS, '1000');
            const receipt = await tx.wait();
            const txCost = receipt.gasUsed * receipt.gasPrice;

            expect(await ethers.provider.getBalance(wallet1)).to.equal(balanceWalletBefore - txCost + 1000n);
            expect(await ethers.provider.getBalance(farm)).to.equal(balanceFarmBefore - 1000n);
        });

        it('should thrown with insufficient funds for gift token', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const duration = BigInt(60 * 60 * 24);
            await farm.startFarming(1000, duration);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await expect(farm.rescueFunds(gift, '1000')).to.be.revertedWithCustomError(farm, 'InsufficientFunds');

            expect(await gift.balanceOf(wallet1)).to.equal(balanceWalletBefore);
            expect(await gift.balanceOf(farm)).to.equal(balanceFarmBefore);
        });

        it('should rescue extra gift tokens from farm to wallet during farming', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const duration = BigInt(60 * 60 * 24);
            const amount = 100n;
            await gift.mint(farm, amount);
            await farm.startFarming(1000, duration);
            await time.increaseTo((await farm.farmInfo()).finished - duration / 2n);

            const balanceWalletBefore = await gift.balanceOf(wallet1);
            const balanceFarmBefore = await gift.balanceOf(farm);
            const farmInfoBefore = await farm.farmInfo();

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.rescueFunds(gift, amount);

            expect(await gift.balanceOf(wallet1)).to.be.equal(balanceWalletBefore + amount);
            expect(await gift.balanceOf(farm)).to.be.equal(balanceFarmBefore - amount);
            expect((await farm.farmInfo()).reward).to.be.equal(farmInfoBefore.reward);
            expect((await farm.farmInfo()).duration).to.be.equal(farmInfoBefore.duration);
            expect((await farm.farmInfo()).finished).to.be.equal(farmInfoBefore.finished);
        });

        it('should transfer all regular tokens', async function () {
            const { regularToken, farm } = await loadFixture(initContracts);
            const amount = 1000n;
            await regularToken.mint(farm, amount);

            const balanceWalletBefore = await regularToken.balanceOf(wallet1);
            const balanceFarmBefore = await regularToken.balanceOf(farm);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.rescueFunds(regularToken, amount);

            expect(await regularToken.balanceOf(wallet1)).to.be.eq(balanceWalletBefore + amount);
            expect(await regularToken.balanceOf(farm)).to.be.eq(balanceFarmBefore - amount);
        });
    });
});
