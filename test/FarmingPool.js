const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, time } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { BigNumber: BN } = require('ethers');
const { timeIncreaseTo, almostEqual, startFarming } = require('./utils');

require('chai').use(function (chai, utils) {
    chai.Assertion.overwriteMethod('almostEqual', (original) => {
        return function (value) {
            if (utils.flag(this, 'bignumber')) {
                const expected = BN.from(value);
                const actual = BN.from(this._obj);
                almostEqual.apply(this, [expected, actual]);
            } else {
                original.apply(this, arguments);
            }
        };
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
        await token.deployed();
        const gift = await TokenMock.deploy('UDSC', 'USDC');
        await gift.deployed();
        const farm = await FarmingPool.deploy(token.address, gift.address);
        await farm.deployed();

        for (const wallet of [wallet1, wallet2, wallet3]) {
            await token.mint(wallet.address, '1000000000');
            await gift.mint(wallet.address, '1000000000');
            await token.connect(wallet).approve(farm.address, '1000000000');
            await gift.connect(wallet).approve(farm.address, '1000000000');
        }

        await farm.setDistributor(wallet1.address);
        return { token, gift, farm };
    };

    describe('startFarming', function () {
        it('should thrown with rewards distribution access denied ', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(
                farm.connect(wallet2).startFarming(1000, 60 * 60 * 24),
            ).to.be.revertedWithCustomError(farm, 'AccessDenied');
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
            expect(await farm.balanceOf(wallet1.address)).to.equal('1000');
            expect(await farm.totalSupply()).to.equal('1000');
        });
    });

    describe('burn', function () {
        it('should be burn', async function () {
            const { farm } = await loadFixture(initContracts);
            await farm.deposit('1000');
            await farm.withdraw('999');
            expect(await farm.balanceOf(wallet1.address)).to.equal('1');
            expect(await farm.totalSupply()).to.equal('1');
        });

        it('should be thrown', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(farm.withdraw('1')).to.be.revertedWith('ERC20: burn amount exceeds balance');
        });
    });

    describe('deposit', function () {
        it('Two stakers with the same stakes wait 1 w', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('1');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            // expect(await farm.farmedPerToken()).to.almostEqual('36000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('36000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('36000');
        });

        it('Two stakers with the different (1:3) stakes wait 1 w', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1.address)).to.equal('0');
            expect(await farm.balanceOf(wallet2.address)).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            // expect(await farm.farmedPerToken()).to.almostEqual('18000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('18000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('54000');
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

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.almostEqual('72000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('72000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('0');

            await farm.startFarming('72000', time.duration.weeks(1));
            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            // expect(await farm.farmedPerToken()).to.almostEqual('90000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('90000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('54000');
        });

        it('One staker on 1st and 3rd weeks farming with gap', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            expect(await farm.farmed(wallet1.address)).to.almostEqual('72000');

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await timeIncreaseTo(started.add(time.duration.weeks(3)));

            expect(await farm.farmed(wallet1.address)).to.almostEqual('144000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('0');
        });

        it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async function () {
            const { farm } = await loadFixture(initContracts);
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            expect(await farm.farmed(wallet1.address)).to.almostEqual('72000');
            await farm.claim();
            expect(await farm.farmed(wallet1.address)).to.almostEqual('0');

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await timeIncreaseTo(started.add(time.duration.weeks(3)));

            expect(await farm.farmed(wallet1.address)).to.almostEqual('72000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('0');
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

            await timeIncreaseTo(started.add(BN.from(time.duration.weeks(1)).add(1)));

            await farm.connect(wallet3).deposit('5');

            expect(await farm.farmed(wallet1.address)).to.almostEqual('18000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('54000');
            expect(await farm.farmed(wallet3.address)).to.almostEqual('0');
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

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            await farm.connect(wallet3).deposit('5');

            // expect(await farm.farmedPerToken()).to.almostEqual('18000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('18000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('54000');

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            // expect(await farm.farmedPerToken()).to.almostEqual('26000'); // 18k + 8k
            expect(await farm.farmed(wallet1.address)).to.almostEqual('26000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('78000');
            expect(await farm.farmed(wallet3.address)).to.almostEqual('40000');

            await farm.connect(wallet2).exit();

            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);
            await timeIncreaseTo(started.add(time.duration.weeks(3)));

            // expect(await farm.farmedPerToken()).to.almostEqual('38000'); // 18k + 8k + 12k
            expect(await farm.farmed(wallet1.address)).to.almostEqual('38000');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('0');
            expect(await farm.farmed(wallet3.address)).to.almostEqual('100000');
        });

        it('One staker on 2 durations with gap', async function () {
            const { farm } = await loadFixture(initContracts);
            // 72000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            // expect(await farm.farmedPerToken()).to.almostEqual('72000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('72000');

            // 72000 UDSC per week for 1 weeks
            await startFarming(farm, '72000', time.duration.weeks(1), wallet1);

            await timeIncreaseTo(started.add(time.duration.weeks(3)));

            // expect(await farm.farmedPerToken()).to.almostEqual('144000');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('144000');
        });

        it('Notify Reward Amount from mocked distribution to 10,000', async function () {
            const { farm } = await loadFixture(initContracts);
            // 10000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '10000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1.address)).to.equal('0');
            expect(await farm.balanceOf(wallet2.address)).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            // expect(await farm.farmedPerToken()).to.almostEqual('2500');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('2500');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('7500');
        });

        it('Thrown with Period too large', async function () {
            const { farm } = await loadFixture(initContracts);
            await expect(
                farm.startFarming('10000', (BN.from(2)).pow(40)),
            ).to.be.revertedWithCustomError(farm, 'DurationTooLarge');
        });

        it('Thrown with Amount too large', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const largeAmount = (BN.from(2)).pow(192);
            await gift.mint(wallet1.address, largeAmount);
            await gift.approve(farm.address, largeAmount);
            await expect(
                farm.startFarming(largeAmount, time.duration.weeks(1)),
            ).to.be.revertedWithCustomError(farm, 'AmountTooLarge');
        });

        it('Notify Reward Amount before prev farming finished', async function () {
            const { farm } = await loadFixture(initContracts);
            // 10000 UDSC per week for 1 weeks
            const started = await startFarming(farm, '10000', time.duration.weeks(1), wallet1);

            // expect(await farm.farmedPerToken()).to.equal('0');
            expect(await farm.balanceOf(wallet1.address)).to.equal('0');
            expect(await farm.balanceOf(wallet2.address)).to.equal('0');
            expect(await farm.farmed(wallet1.address)).to.equal('0');
            expect(await farm.farmed(wallet2.address)).to.equal('0');

            // 1000 UDSC per week for 1 weeks
            await startFarming(farm, '1000', time.duration.weeks(1), wallet1);

            await farm.deposit('1');
            await farm.connect(wallet2).deposit('3');

            await timeIncreaseTo(started.add(time.duration.weeks(1)).add(2));

            // expect(await farm.farmedPerToken()).to.almostEqual('2750');
            expect(await farm.farmed(wallet1.address)).to.almostEqual('2750');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('8250');
        });
    });

    describe('transfer', function () {
        const farmingAmount = BN.from('72000');
        const wallet1Amount = BN.from('1');
        const wallet2Amount = BN.from('3');
        const wallet3Amount = BN.from('1');

        it('should be correct farming after transfered from non-farm user to farm user', async function () {
            const { farm } = await loadFixture(initContracts);

            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount);
            await farm.connect(wallet2).deposit(wallet2Amount);

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            // farmedWalletPerWeek = farmingAmount / 2 * wallet1Amount / (wallet1Amount + wallet2Amount)
            const farmedWallet1PerWeek = farmingAmount.div(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.div(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2PerWeek);
            expect(await farm.farmed(wallet3.address)).to.almostEqual('0');

            await farm.connect(wallet3).deposit(wallet3Amount);
            await farm.connect(wallet3).transfer(wallet1.address, wallet3Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1.address);
            const balanceWallet2 = await farm.balanceOf(wallet2.address);
            const balanceWallet3 = await farm.balanceOf(wallet3.address);
            expect(balanceWallet1).to.equal(wallet1Amount.add(wallet3Amount));
            expect(balanceWallet2).to.equal(wallet2Amount);
            expect(balanceWallet3).to.equal('0');

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.div(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.div(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2Per2Week);
            expect(await farm.farmed(wallet3.address)).to.almostEqual('0');
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to non-farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount.add(wallet2Amount));

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.div(2);
            const farmedWallet2PerWeek = BN.from('0');
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2PerWeek);

            await farm.transfer(wallet2.address, wallet2Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1.address);
            const balanceWallet2 = await farm.balanceOf(wallet2.address);
            expect(balanceWallet1).to.equal(wallet1Amount);
            expect(balanceWallet2).to.equal(wallet2Amount);

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.div(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.div(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from non-farm user to non-farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            expect(await farm.farmed(wallet1.address)).to.almostEqual('0');
            expect(await farm.farmed(wallet2.address)).to.almostEqual('0');

            await farm.deposit(wallet1Amount.add(wallet2Amount));
            await farm.transfer(wallet2.address, wallet2Amount);

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            const farmedWallet1PerWeek = farmingAmount.div(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.div(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2PerWeek);
            console.log('farmed after week {wallet1, wallet2} = {0, 0}');
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to farm user', async function () {
            const { farm } = await loadFixture(initContracts);
            const started = await startFarming(farm, farmingAmount, time.duration.weeks(2), wallet1);
            await farm.deposit(wallet1Amount);
            await farm.connect(wallet2).deposit(wallet2Amount);

            await timeIncreaseTo(started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.div(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.div(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1PerWeek);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2PerWeek);

            await farm.connect(wallet2).transfer(wallet1.address, wallet1Amount);

            const balanceWallet1 = await farm.balanceOf(wallet1.address);
            const balanceWallet2 = await farm.balanceOf(wallet2.address);
            expect(balanceWallet1).to.equal(wallet1Amount.add(wallet1Amount));
            expect(balanceWallet2).to.equal(wallet2Amount.sub(wallet1Amount));

            await timeIncreaseTo(started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.div(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.div(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await farm.farmed(wallet1.address)).to.almostEqual(farmedWallet1Per2Week);
            expect(await farm.farmed(wallet2.address)).to.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);

            expect(farmedWallet1Per2Week.sub(farmedWallet1PerWeek)).to.equal(farmedWallet2Per2Week.sub(farmedWallet2PerWeek));
        });
    });

    describe('rescueFunds', function () {
        it('should thrown with access denied', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            const distributor = await farm.distributor();
            expect(wallet2.address).to.not.equal(distributor);
            await expect(
                farm.connect(wallet2).rescueFunds(gift.address, '1000'),
            ).to.be.revertedWithCustomError(farm, 'AccessDenied');
        });

        it('should transfer tokens from farm to wallet', async function () {
            const { gift, farm } = await loadFixture(initContracts);
            await farm.startFarming(1000, time.duration.weeks(1));

            const balanceWalletBefore = await gift.balanceOf(wallet1.address);
            const balanceFarmBefore = await gift.balanceOf(farm.address);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.rescueFunds(gift.address, '1000');

            expect(await gift.balanceOf(wallet1.address)).to.equal(balanceWalletBefore.add(1000));
            expect(await gift.balanceOf(farm.address)).to.equal(balanceFarmBefore.sub(1000));
        });

        it('should thrown with not enough balance for staking token', async function () {
            const { token, farm } = await loadFixture(initContracts);
            await farm.deposit('1000');
            expect(await farm.totalSupply()).to.gt('0');

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await expect(
                farm.rescueFunds(token.address, '1000'),
            ).to.be.revertedWithCustomError(farm, 'NotEnoughBalance');
        });

        it('should transfer staking token and leave balance of staking tokens more than (and equals to) totalBalance amount', async function () {
            const { token, farm } = await loadFixture(initContracts);
            await token.transfer(farm.address, '1000');
            await farm.deposit('1000');
            expect(await farm.totalSupply()).to.gt('0');

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            await farm.rescueFunds(token.address, '500');
            expect(await token.balanceOf(farm.address)).to.gt(await farm.totalSupply());

            await farm.rescueFunds(token.address, '500');
            expect(await token.balanceOf(farm.address)).to.equal(await farm.totalSupply());
        });

        it('should transfer ethers from farm to wallet', async function () {
            const { farm } = await loadFixture(initContracts);
            // Transfer ethers to farm
            const ethMock = await EthTransferMock.deploy(farm.address, { value: '1000' });
            await ethMock.deployed();

            // Check rescueFunds
            const balanceWalletBefore = await ethers.provider.getBalance(wallet1.address);
            const balanceFarmBefore = await ethers.provider.getBalance(farm.address);

            const distributor = await farm.distributor();
            expect(wallet1.address).to.equal(distributor);
            const tx = await farm.rescueFunds(constants.ZERO_ADDRESS, '1000');
            const receipt = await tx.wait();
            const txCost = BN.from(receipt.gasUsed).mul(receipt.effectiveGasPrice);

            expect(await ethers.provider.getBalance(wallet1.address)).to.equal(balanceWalletBefore.sub(txCost).add(1000));
            expect(await ethers.provider.getBalance(farm.address)).to.equal(balanceFarmBefore.sub(1000));
        });
    });
});
