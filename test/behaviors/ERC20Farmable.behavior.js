const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual } = require('../utils');

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

const shouldBehaveLikeFarmable = (getContext) => {
    describe('should behave like farmable', async () => {
        const ctx = {};

        before(async () => {
            ctx.initialSupply = getContext().initialSupply;
            ctx.initialHolder = getContext().initialHolder;
            ctx.recipient = getContext().recipient;
            ctx.anotherAccount = getContext().anotherAccount;
        });

        beforeEach(async () => {
            ctx.token = getContext().token;
            ctx.farm = getContext().farm;
            ctx.gift = getContext().gift;

            for (const wallet of [ctx.initialHolder, ctx.recipient, ctx.anotherAccount]) {
                await ctx.gift.mint(wallet, '1000000000');
                await ctx.gift.approve(ctx.farm.address, '1000000000', { from: wallet });
            }

            await ctx.farm.setDistributor(ctx.initialHolder);

            ctx.started = (await time.latest()).addn(10);
            await timeIncreaseTo(ctx.started);
        });

        describe('farm', async () => {
            it('should update totalSupply', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
            });

            it('should make totalSupply to decrease with balance', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.muln(6).divn(10), { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply.muln(4).divn(10));
            });

            it('should make totalSupply to increase with balance', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply.divn(2));
                await ctx.token.transfer(ctx.initialHolder, ctx.initialSupply.divn(2), { from: ctx.recipient });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
            });

            it('should make totalSupply ignore internal transfers', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
            });

            it('should be thrown', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await expectRevert(
                    ctx.token.join(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20Farmable: already farming',
                );
            });
        });

        describe('userFarms', async () => {
            it('should return user farms', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                const initialHolderFarms = await ctx.token.userFarms(ctx.initialHolder);
                expect(initialHolderFarms.length).to.be.equal(1);
                expect(initialHolderFarms[0]).to.be.equal(ctx.farm.address);
            });
        });

        describe('exit', async () => {
            it('should be burn', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal('0');
            });

            it('should be thrown', async () => {
                await expectRevert(
                    ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20Farmable: already exited',
                );
            });
        });

        describe('deposit', async () => {
            it('Two stakers with the same stakes wait 1 w', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });

                // 72000 UDSC per week for 3 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('36000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('36000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('36000');
            });

            it('Two stakers with the different (1:3) stakes wait 1 w', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });

                // 72000 UDSC per week
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('54000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('18000');
            });

            it('Two stakers with the different (1:3) stakes wait 2 weeks', async () => {
                //
                // 1x: +----------------+ = 72k for 1w + 18k for 2w
                // 3x:         +--------+ =  0k for 1w + 54k for 2w
                //
                const recipientAmount = ctx.initialSupply.muln(3).divn(4);
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });

                // 72000 UDSC per week
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.almostEqual(ctx.initialSupply.sub(recipientAmount));

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('72000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');

                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('90000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('90000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('54000');
            });

            it('One staker on 1st and 3rd weeks farming with gap', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('144000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                await ctx.token.claim(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                await ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('144000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                await ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                await ctx.token.claim(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('0');
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');
            });

            it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async () => {
                //
                // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = ctx.initialSupply.divn(3);
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });
                const anotherAccountAmount = ctx.initialSupply.muln(5).divn(9);
                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });

                // 72000 UDSC per week for 3 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                await ctx.token.join(ctx.farm.address, { from: ctx.anotherAccount });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('54000');

                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('26000'); // 18k + 8k
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('26000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('78000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('40000');

                await ctx.token.quit(ctx.farm.address, { from: ctx.recipient });

                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('38000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('78000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('100000');
            });

            it('Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event', async () => {
                //
                // 1x: +-------------------------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = ctx.initialSupply.divn(3);
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });
                const anotherAccountAmount = ctx.initialSupply.muln(5).divn(9);
                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });

                // 72000 UDSC per week for 3 weeks
                await ctx.farm.startFarming('216000', time.duration.weeks(3), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                await ctx.token.join(ctx.farm.address, { from: ctx.anotherAccount });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('54000');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                await ctx.token.quit(ctx.farm.address, { from: ctx.recipient });

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('26000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('78000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('40000');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('38000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('78000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('100000');
            });

            it('One staker on 2 durations with gap', async () => {
                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('72000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('72000');

                // 72000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(1), { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(3)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('144000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('144000');
            });

            it('Notify Reward Amount from mocked distribution to 10,000', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });

                // 10000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('10000', time.duration.weeks(1), { from: ctx.initialHolder });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('2500');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('7500');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('2500');
            });

            it('Notify Reward Amount before prev farming finished', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });

                // 10000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('10000', time.duration.weeks(1), { from: ctx.initialHolder });

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                // 1000 UDSC per week for 1 weeks
                await ctx.farm.startFarming('1000', time.duration.weeks(1), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)).addn(2));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('2750');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('8250');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('2750');
            });
        });

        describe('transfers', async () => {
            it('Transfer from one wallet to another, both farming', async () => {
                //
                // 2x: +-------+ 1х+--------+   = 9k  for 1w + 27k for 2w = 36
                // 1x: +-------+ 2x+--------+   = 27k for 1w +  9k for 2w = 36
                //
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });

                // 36000 UDSC per week for 2 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(2), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('27000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('9000');

                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('36000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('36000');
            });

            it('Transfer from one wallet to another, sender is farming, reciever is not farming', async () => {
                //
                // 1x: +-------+--------+   = 18k for 1w + 36k for 2w
                // 1x: +-------+            = 18k for 1w +  0k for 2w
                //
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });

                // 36000 UDSC per week for 2 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(2), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('18000');

                await ctx.token.transfer(ctx.anotherAccount, ctx.initialSupply.divn(2), { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // expect(await ctx.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('54000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('18000');
            });

            it('Top up farming wallet', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.anotherAccount, ctx.initialSupply.divn(2), { from: ctx.initialHolder });

                // 36000 UDSC per week for 2 weeks
                await ctx.farm.startFarming('72000', time.duration.weeks(2), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('18000');

                await ctx.token.transfer(ctx.initialHolder, ctx.initialSupply.divn(2), { from: ctx.anotherAccount });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('45000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('27000');
            });
        });

        describe('transfer', async () => {
            let farmingAmount, initialHolderAmount, recipientAmount, anotherAccountAmount;

            before(async () => {
                farmingAmount = new BN('72000');
                initialHolderAmount = ctx.initialSupply.divn(5);
                recipientAmount = ctx.initialSupply.muln(3).divn(5);
                anotherAccountAmount = ctx.initialSupply.divn(5);
            });

            it('should be correct farming after transfered from non-farm user to farm user', async () => {
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });

                await ctx.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                // farmedWalletPerWeek = farmingAmount / 2 * initialHolderAmount / (initialHolderAmount + recipientAmount)
                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('0');

                await ctx.token.transfer(ctx.initialHolder, anotherAccountAmount, { from: ctx.anotherAccount });
                await ctx.token.join(ctx.farm.address, { from: ctx.anotherAccount });

                const balanceinitialHolder = await ctx.token.balanceOf(ctx.initialHolder);
                const balancerecipient = await ctx.token.balanceOf(ctx.recipient);
                const balanceanotherAccount = await ctx.token.balanceOf(ctx.anotherAccount);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount.add(anotherAccountAmount));
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount);
                expect(balanceanotherAccount).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balancerecipient / (balanceinitialHolder + balancerecipient);
                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.anotherAccount)).to.be.bignumber.almostEqual('0');
                console.log(`farmed after week {initialHolder, ctx.recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, ctx.recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);
            });

            it('should be correct farming after transfered from farm user to non-farm user', async () => {
                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });

                await ctx.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2);
                const farmedrecipientPerWeek = new BN('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);

                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                const balanceinitialHolder = await ctx.token.balanceOf(ctx.initialHolder);
                const balancerecipient = await ctx.token.balanceOf(ctx.recipient);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount);
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount);

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                console.log(`farmed after week {initialHolder, ctx.recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, ctx.recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);
            });

            it('should be correct farming after transfered from non-farm user to non-farm user', async () => {
                await ctx.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('0');

                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);
                console.log('farmed after week {initialHolder, ctx.recipient} = {0, 0}');
                console.log(`farmed after transfer and additional week {initialHolder, ctx.recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
            });

            it('should be correct farming after transfered from farm user to farm user', async () => {
                await ctx.token.transfer(ctx.anotherAccount, anotherAccountAmount, { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.recipient, recipientAmount, { from: ctx.initialHolder });

                await ctx.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);

                await ctx.token.transfer(ctx.initialHolder, initialHolderAmount, { from: ctx.recipient });

                const balanceinitialHolder = await ctx.token.balanceOf(ctx.initialHolder);
                const balancerecipient = await ctx.token.balanceOf(ctx.recipient);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount.add(initialHolderAmount));
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount.sub(initialHolderAmount));

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                console.log(`farmed after week {initialHolder, ctx.recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, ctx.recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);

                expect(farmedinitialHolderPer2Week.sub(farmedinitialHolderPerWeek)).to.be.bignumber.equal(farmedrecipientPer2Week.sub(farmedrecipientPerWeek));
            });
        });
    });
};

module.exports = {
    shouldBehaveLikeFarmable,
};
