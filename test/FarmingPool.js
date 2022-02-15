const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual } = require('./utils');

const FarmingPool = artifacts.require('FarmingPool');
const TokenMock = artifacts.require('TokenMock');

require('chai').use(function (chai, utils) {
    chai.Assertion.overwriteMethod('almostEqual', function (original) {
        return function (value) {
            if (utils.flag(this, 'bignumber')) {
                const expected = new BN(value);
                const actual = new BN(this._obj);
                almostEqual.apply(this, [expected, actual]);
            } else {
                original.apply(this, arguments);
            }
        };
    });
});

contract('FarmingPool', function ([wallet1, wallet2, wallet3]) {
    beforeEach(async () => {
        this.token = await TokenMock.new('1INCH', '1INCH', '0');
        this.gift = await TokenMock.new('UDSC', 'USDC', '0');
        this.farm = await FarmingPool.new(this.token.address, this.gift.address);

        for (const wallet of [wallet1, wallet2, wallet3]) {
            await this.token.mint(wallet, '1000000000');
            await this.gift.mint(wallet, '1000000000');
            await this.token.approve(this.farm.address, '1000000000', { from: wallet });
            await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
        }

        await this.farm.setDistributor(wallet1, { from: wallet1 });

        this.started = (await time.latest()).addn(10);
        await timeIncreaseTo(this.started);
    });

    describe('startFarming', async () => {
        it('should thrown with rewards distribution access denied ', async () => {
            await expectRevert(
                this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
                'FP: access denied',
            );
        });
    });

    describe('name', async () => {
        it('should be return name', async () => {
            expect(await this.farm.name()).to.be.equal('Farming of ' + await this.token.name());
        });
    });

    describe('symbol', async () => {
        it('should be return symbol', async () => {
            expect(await this.farm.symbol()).to.be.equal('farm' + await this.token.name());
        });
    });

    describe('decimals', async () => {
        it('should be return decimals', async () => {
            expect(await this.farm.decimals()).to.be.bignumber.equal(await this.token.decimals());
        });
    });

    describe('mint', async () => {
        it('should be mint', async () => {
            await this.farm.deposit('1000', { from: wallet1 });
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('1000');
            expect(await this.farm.totalSupply()).to.be.bignumber.equal('1000');
        });
    });

    describe('burn', async () => {
        it('should be burn', async () => {
            await this.farm.deposit('1000', { from: wallet1 });
            await this.farm.withdraw('999', { from: wallet1 });
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('1');
            expect(await this.farm.totalSupply()).to.be.bignumber.equal('1');
        });

        it('should be thrown', async () => {
            await expectRevert(
                this.farm.withdraw('1', { from: wallet1 }),
                'ERC20: burn amount exceeds balance',
            );
        });
    });

    describe('deposit', async () => {
        it('Two stakers with the same stakes wait 1 w', async () => {
            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('1', { from: wallet2 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('36000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('36000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('36000');
        });

        it('Two stakers with the different (1:3) stakes wait 1 w', async () => {
            // 72000 UDSC per week
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet2)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('3', { from: wallet2 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('18000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('54000');
        });

        it('Two stakers with the different (1:3) stakes wait 2 weeks', async () => {
            //
            // 1x: +----------------+ = 72k for 1w + 18k for 2w
            // 3x:         +--------+ =  0k for 1w + 54k for 2w
            //

            // 72000 UDSC per week
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            await this.farm.deposit('3', { from: wallet2 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('72000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('72000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('0');

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('90000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('90000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('54000');
        });

        it('One staker on 1st and 3rd weeks farming with gap', async () => {
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('72000');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('144000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('0');
        });

        it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async () => {
            //
            // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('72000');
            await this.farm.claim({ from: wallet1 });
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('72000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('0');
        });

        it('Three stakers with the different (1:3:5) stakes wait 3 weeks + 1 second', async () => {
            //
            // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
            // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
            // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('3', { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1).addn(1)));

            await this.farm.deposit('5', { from: wallet3 });

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('54000');
            expect(await this.farm.farmed(wallet3)).to.be.bignumber.almostEqual('0');
        });

        it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async () => {
            //
            // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
            // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
            // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
            //

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('3', { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            await this.farm.deposit('5', { from: wallet3 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('18000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('54000');

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('26000'); // 18k + 8k
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('26000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('78000');
            expect(await this.farm.farmed(wallet3)).to.be.bignumber.almostEqual('40000');

            await this.farm.exit({ from: wallet2 });

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('38000');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('0');
            expect(await this.farm.farmed(wallet3)).to.be.bignumber.almostEqual('100000');
        });

        it('One staker on 2 durations with gap', async () => {
            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('72000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('72000');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('144000');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('144000');
        });

        it('Notify Reward Amount from mocked distribution to 10,000', async () => {
            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet2)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('3', { from: wallet2 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('2500');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('2500');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('7500');
        });

        it('Thrown with Period too large', async () => {
            await expectRevert(
                this.farm.startFarming('10000', (new BN(2)).pow(new BN(40)), { from: wallet1 }),
                'FA: period too large',
            );
        });

        it('Thrown with Amount too large', async () => {
            const largeAmount = (new BN(2)).pow(new BN(192));
            await this.gift.mint(wallet1, largeAmount, { from: wallet1 });
            await this.gift.approve(this.farm.address, largeAmount, { from: wallet1 });
            await expectRevert(
                this.farm.startFarming(largeAmount, time.duration.weeks(1), { from: wallet1 }),
                'FA: amount too large',
            );
        });

        it('Notify Reward Amount before prev farming finished', async () => {
            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet2)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            // 1000 UDSC per week for 1 weeks
            await this.farm.startFarming('1000', time.duration.weeks(1), { from: wallet1 });

            await this.farm.deposit('1', { from: wallet1 });
            await this.farm.deposit('3', { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)).addn(2));

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.almostEqual('2750');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('2750');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('8250');
        });
    });

    describe('transfer', async () => {
        const farmingAmount = new BN('72000');
        const wallet1Amount = new BN('1');
        const wallet2Amount = new BN('3');
        const wallet3Amount = new BN('1');

        it('should be correct farming after transfered from non-farm user to farm user', async () => {
            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });
            await this.farm.deposit(wallet1Amount, { from: wallet1 });
            await this.farm.deposit(wallet2Amount, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            // farmedWalletPerWeek = farmingAmount / 2 * wallet1Amount / (wallet1Amount + wallet2Amount)
            const farmedWallet1PerWeek = farmingAmount.divn(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.divn(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);
            expect(await this.farm.farmed(wallet3)).to.be.bignumber.almostEqual('0');

            await this.farm.deposit(wallet3Amount, { from: wallet3 });
            await this.farm.transfer(wallet1, wallet3Amount, { from: wallet3 });

            const balanceWallet1 = await this.farm.balanceOf(wallet1);
            const balanceWallet2 = await this.farm.balanceOf(wallet2);
            const balanceWallet3 = await this.farm.balanceOf(wallet3);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount.add(wallet3Amount));
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount);
            expect(balanceWallet3).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            expect(await this.farm.farmed(wallet3)).to.be.bignumber.almostEqual('0');
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to non-farm user', async () => {
            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });
            await this.farm.deposit(wallet1Amount.add(wallet2Amount), { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.divn(2);
            const farmedWallet2PerWeek = new BN('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);

            await this.farm.transfer(wallet2, wallet2Amount, { from: wallet1 });

            const balanceWallet1 = await this.farm.balanceOf(wallet1);
            const balanceWallet2 = await this.farm.balanceOf(wallet2);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount);
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount);

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        it('should be correct farming after transfered from non-farm user to non-farm user', async () => {
            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual('0');

            await this.farm.deposit(wallet1Amount.add(wallet2Amount), { from: wallet1 });
            await this.farm.transfer(wallet2, wallet2Amount, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            const farmedWallet1PerWeek = farmingAmount.divn(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.divn(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);
            console.log('farmed after week {wallet1, wallet2} = {0, 0}');
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
        });

        it('should be correct farming after transfered from farm user to farm user', async () => {
            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });
            await this.farm.deposit(wallet1Amount, { from: wallet1 });
            await this.farm.deposit(wallet2Amount, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.divn(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.divn(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);

            await this.farm.transfer(wallet1, wallet1Amount, { from: wallet2 });

            const balanceWallet1 = await this.farm.balanceOf(wallet1);
            const balanceWallet2 = await this.farm.balanceOf(wallet2);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount.add(wallet1Amount));
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount.sub(wallet1Amount));

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);

            expect(farmedWallet1Per2Week.sub(farmedWallet1PerWeek)).to.be.bignumber.equal(farmedWallet2Per2Week.sub(farmedWallet2PerWeek));
        });
    });
});
