const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');

const FarmingPool = artifacts.require('FarmingPool');
const TokenMock = artifacts.require('TokenMock');

async function timeIncreaseTo (seconds) {
    const delay = 10 - new Date().getMilliseconds();
    await new Promise(resolve => setTimeout(resolve, delay));
    await time.increaseTo(seconds);
}

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
    beforeEach(async function () {
        this.token = await TokenMock.new('1INCH', '1INCH');
        this.gift = await TokenMock.new('UDSC', 'USDC');
        this.farm = await FarmingPool.new(this.token.address, this.gift.address, false);

        for (const wallet of [wallet1, wallet2, wallet3]) {
            await this.token.mint(wallet, '1000000000');
            await this.gift.mint(wallet, '1000000000');
            await this.token.approve(this.farm.address, '1000000000', { from: wallet });
            await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
        }

        this.started = (await time.latest()).addn(10);
        await timeIncreaseTo(this.started);
    });

    describe('name', async function () {
        it('should be return name', async function () {
            expect(await this.farm.name()).to.be.equal('Farming of ' + await this.token.name());
        });
    });

    describe('symbol', async function () {
        it('should be return symbol', async function () {
            expect(await this.farm.symbol()).to.be.equal('farm' + await this.token.name());
        });
    });

    describe('decimals', async function () {
        it('should be return decimals', async function () {
            expect(await this.farm.decimals()).to.be.bignumber.equal(await this.token.decimals());
        });
    });

    describe('mint', async function () {
        it('should be mint', async function () {
            await this.farm.deposit('1000', { from: wallet1 });
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('1000');
            expect(await this.farm.totalSupply()).to.be.bignumber.equal('1000');
        });
    });

    describe('burn', async function () {
        it('should be burn', async function () {
            await this.farm.deposit('1000', { from: wallet1 });
            await this.farm.withdraw('999', { from: wallet1 });
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('1');
            expect(await this.farm.totalSupply()).to.be.bignumber.equal('1');
        });

        it('should be thrown', async function () {
            await expectRevert(
                this.farm.withdraw('1', { from: wallet1 }),
                'ERC20: burn amount exceeds balance',
            );
        });
    });

    describe('deposit', async function () {
        it('Two stakers with the same stakes wait 1 w', async function () {
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

        it('Two stakers with the different (1:3) stakes wait 1 w', async function () {
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

        it('Two stakers with the different (1:3) stakes wait 2 weeks', async function () {
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

        it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async function () {
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

        it('One staker on 2 durations with gap', async function () {
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

        it('Notify Reward Amount from mocked distribution to 10,000', async function () {
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

        it('Thrown with Period too large', async function () {
            await expectRevert(
                this.farm.startFarming('10000', (new BN(2)).pow(new BN(40)), { from: wallet1 }),
                'Period too large',
            );
        });

        it('Thrown with Amount too large', async function () {
            const largeAmount = (new BN(2)).pow(new BN(192));
            await this.gift.mint(wallet1, largeAmount, { from: wallet1 });
            await this.gift.approve(this.farm.address, largeAmount, { from: wallet1 });
            await expectRevert(
                this.farm.startFarming(largeAmount, time.duration.weeks(1), { from: wallet1 }),
                'Amount too large',
            );
        });

        it('Notify Reward Amount before prev farming finished', async function () {
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

        it('Notify Reward Amount before prev farming finished with thrown', async function () {
            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet2)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            // 1000 UDSC per week for 10 weeks
            await expectRevert(
                this.farm.startFarming('1000', time.duration.weeks(10), { from: wallet1 }),
                'FP: can\'t lower speed',
            );
        });

        it('Notify Reward Amount with farming shortening denied thrown', async function () {
            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });

            // expect(await this.farm.farmedPerToken()).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.balanceOf(wallet2)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet1)).to.be.bignumber.equal('0');
            expect(await this.farm.farmed(wallet2)).to.be.bignumber.equal('0');

            // 1000 UDSC per week for 1 days
            await expectRevert(
                this.farm.startFarming('1000', time.duration.days(1), { from: wallet1 }),
                'FP: farming shortening denied',
            );
        });
    });
});
