const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual } = require('../utils');

const Farm = artifacts.require('Farm');
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

function shouldBehaveLikeFarmable (initialSupply, initialHolder, recipient, anotherAccount) {
    describe('should behave like farmable', async () => {
        beforeEach(async () => {
            this.gift = await TokenMock.new('UDSC', 'USDC');
            this.farm = await Farm.new(this.token.address, this.gift.address);

            for (const wallet of [initialHolder, recipient, anotherAccount]) {
                await this.gift.mint(wallet, '1000000000');
                await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
            }

            await this.farm.setDistributor(initialHolder);

            this.started = (await time.latest()).addn(10);
            await timeIncreaseTo(this.started);
        });

        describe('farm', async () => {
            it('should update totalSupply', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply);
            });

            it('should make totalSupply to decrease with balance', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.transfer(recipient, initialSupply.muln(6).divn(10), { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply.muln(4).divn(10));
            });

            it('should make totalSupply to increase with balance', async () => {
                await this.token.transfer(recipient, initialSupply.divn(2), { from: initialHolder });
                await this.token.join(this.farm.address, { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply.divn(2));
                await this.token.transfer(initialHolder, initialSupply.divn(2), { from: recipient });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply);
            });

            it('should make totalSupply ignore internal transfers', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply);
                await this.token.transfer(recipient, initialSupply.divn(2), { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal(initialSupply);
            });

            it('should be thrown', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                await expectRevert(
                    this.token.join(this.farm.address, { from: initialHolder }),
                    'ERC20Farmable: already farming',
                );
            });
        });

        describe('userFarms', async () => {
            it('should return user farms', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                const initialHolderFarms = await this.token.userFarms(initialHolder);
                expect(initialHolderFarms.length).to.be.equal(1);
                expect(initialHolderFarms[0]).to.be.equal(this.farm.address);
            });
        });

        describe('exit', async () => {
            it('should be burn', async () => {
                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.quit(this.farm.address, { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('0');
            });

            it('should be thrown', async () => {
                await expectRevert(
                    this.token.quit(this.farm.address, { from: initialHolder }),
                    'ERC20Farmable: already exited',
                );
            });
        });

        describe('deposit', async () => {
            it('Two stakers with the same stakes wait 1 w', async () => {
                await this.token.transfer(recipient, initialSupply.divn(2), { from: initialHolder });

                // 72000 UDSC per week for 3 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('36000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('36000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('36000');
            });

            it('Two stakers with the different (1:3) stakes wait 1 w', async () => {
                await this.token.transfer(recipient, initialSupply.divn(4), { from: initialHolder });

                // 72000 UDSC per week
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('54000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('18000');
            });

            it('Two stakers with the different (1:3) stakes wait 2 weeks', async () => {
                //
                // 1x: +----------------+ = 72k for 1w + 18k for 2w
                // 3x:         +--------+ =  0k for 1w + 54k for 2w
                //
                const recipientAmount = initialSupply.muln(3).divn(4);
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });

                // 72000 UDSC per week
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.almostEqual(initialSupply.sub(recipientAmount));

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                await this.token.join(this.farm.address, { from: recipient });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('72000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');

                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('90000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('90000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('54000');
            });

            it('One staker on 1st and 3rd weeks farming with gap', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('144000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                await this.token.claim(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                await this.token.quit(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                await this.token.join(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('144000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');
            });

            it('One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle', async () => {
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                await this.token.quit(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                await this.token.claim(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('0');
                await this.token.join(this.farm.address, { from: initialHolder });
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');
            });

            it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async () => {
                //
                // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = initialSupply.divn(3);
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });
                const anotherAccountAmount = initialSupply.muln(5).divn(9);
                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });

                // 72000 UDSC per week for 3 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                await this.token.join(this.farm.address, { from: anotherAccount });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('54000');

                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('26000'); // 18k + 8k
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('26000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('78000');
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('40000');

                await this.token.quit(this.farm.address, { from: recipient });

                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });
                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('38000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('78000');
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('100000');
            });

            it('Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event', async () => {
                //
                // 1x: +-------------------------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = initialSupply.divn(3);
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });
                const anotherAccountAmount = initialSupply.muln(5).divn(9);
                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });

                // 72000 UDSC per week for 3 weeks
                await this.farm.startFarming('216000', time.duration.weeks(3), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                await this.token.join(this.farm.address, { from: anotherAccount });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('54000');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                await this.token.quit(this.farm.address, { from: recipient });

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('26000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('78000');
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('40000');

                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('38000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('78000');
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('100000');
            });

            it('One staker on 2 durations with gap', async () => {
                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('72000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('72000');

                // 72000 UDSC per week for 1 weeks
                await this.farm.startFarming('72000', time.duration.weeks(1), { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('144000');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('144000');
            });

            it('Notify Reward Amount from mocked distribution to 10,000', async () => {
                await this.token.transfer(recipient, initialSupply.divn(4), { from: initialHolder });

                // 10000 UDSC per week for 1 weeks
                await this.farm.startFarming('10000', time.duration.weeks(1), { from: initialHolder });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('2500');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('7500');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('2500');
            });

            it('Notify Reward Amount before prev farming finished', async () => {
                await this.token.transfer(recipient, initialSupply.divn(4), { from: initialHolder });

                // 10000 UDSC per week for 1 weeks
                await this.farm.startFarming('10000', time.duration.weeks(1), { from: initialHolder });

                // expect(await this.token.farmedPerToken()).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.equal('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.equal('0');

                // 1000 UDSC per week for 1 weeks
                await this.farm.startFarming('1000', time.duration.weeks(1), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)).addn(2));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('2750');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('8250');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('2750');
            });
        });

        describe('transfers', async () => {
            it('Transfer from one wallet to another, both farming', async () => {
                //
                // 2x: +-------+ 1х+--------+   = 9k  for 1w + 27k for 2w = 36
                // 1x: +-------+ 2x+--------+   = 27k for 1w +  9k for 2w = 36
                //
                await this.token.transfer(recipient, initialSupply.divn(4), { from: initialHolder });

                // 36000 UDSC per week for 2 weeks
                await this.farm.startFarming('72000', time.duration.weeks(2), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('27000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('9000');

                await this.token.transfer(recipient, initialSupply.divn(2), { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('36000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('36000');
            });

            it('Transfer from one wallet to another, sender is farming, reciever is not farming', async () => {
                //
                // 1x: +-------+--------+   = 18k for 1w + 36k for 2w
                // 1x: +-------+            = 18k for 1w +  0k for 2w
                //
                await this.token.transfer(recipient, initialSupply.divn(2), { from: initialHolder });

                // 36000 UDSC per week for 2 weeks
                await this.farm.startFarming('72000', time.duration.weeks(2), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('18000');

                await this.token.transfer(anotherAccount, initialSupply.divn(2), { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('54000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('18000');
            });

            it('Top up farming wallet', async () => {
                await this.token.transfer(recipient, initialSupply.divn(4), { from: initialHolder });
                await this.token.transfer(anotherAccount, initialSupply.divn(2), { from: initialHolder });

                // 36000 UDSC per week for 2 weeks
                await this.farm.startFarming('72000', time.duration.weeks(2), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('18000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('18000');

                await this.token.transfer(initialHolder, initialSupply.divn(2), { from: anotherAccount });

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('45000');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('27000');
            });
        });

        describe('transfer', async () => {
            const farmingAmount = new BN('72000');
            const initialHolderAmount = initialSupply.divn(5);
            const recipientAmount = initialSupply.muln(3).divn(5);
            const anotherAccountAmount = initialSupply.divn(5);

            it('should be correct farming after transfered from non-farm user to farm user', async () => {
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });
                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });

                await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: initialHolder });
                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                // farmedWalletPerWeek = farmingAmount / 2 * initialHolderAmount / (initialHolderAmount + recipientAmount)
                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('0');

                await this.token.transfer(initialHolder, anotherAccountAmount, { from: anotherAccount });
                await this.token.join(this.farm.address, { from: anotherAccount });

                const balanceinitialHolder = await this.token.balanceOf(initialHolder);
                const balancerecipient = await this.token.balanceOf(recipient);
                const balanceanotherAccount = await this.token.balanceOf(anotherAccount);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount.add(anotherAccountAmount));
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount);
                expect(balanceanotherAccount).to.be.bignumber.equal('0');

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balancerecipient / (balanceinitialHolder + balancerecipient);
                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                expect(await this.token.farmed(this.farm.address, anotherAccount)).to.be.bignumber.almostEqual('0');
                console.log(`farmed after week {initialHolder, recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);
            });

            it('should be correct farming after transfered from farm user to non-farm user', async () => {
                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });

                await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2);
                const farmedrecipientPerWeek = new BN('0');
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);

                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                const balanceinitialHolder = await this.token.balanceOf(initialHolder);
                const balancerecipient = await this.token.balanceOf(recipient);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount);
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount);

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                console.log(`farmed after week {initialHolder, recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);
            });

            it('should be correct farming after transfered from non-farm user to non-farm user', async () => {
                await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: initialHolder });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual('0');
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual('0');

                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);
                console.log('farmed after week {initialHolder, recipient} = {0, 0}');
                console.log(`farmed after transfer and additional week {initialHolder, recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
            });

            it('should be correct farming after transfered from farm user to farm user', async () => {
                await this.token.transfer(anotherAccount, anotherAccountAmount, { from: initialHolder });
                await this.token.transfer(recipient, recipientAmount, { from: initialHolder });

                await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: initialHolder });

                await this.token.join(this.farm.address, { from: initialHolder });
                await this.token.join(this.farm.address, { from: recipient });

                await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

                const farmedinitialHolderPerWeek = farmingAmount.divn(2).mul(initialHolderAmount).div(initialHolderAmount.add(recipientAmount));
                const farmedrecipientPerWeek = farmingAmount.divn(2).mul(recipientAmount).div(initialHolderAmount.add(recipientAmount));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPerWeek);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPerWeek);

                await this.token.transfer(initialHolder, initialHolderAmount, { from: recipient });

                const balanceinitialHolder = await this.token.balanceOf(initialHolder);
                const balancerecipient = await this.token.balanceOf(recipient);
                expect(balanceinitialHolder).to.be.bignumber.equal(initialHolderAmount.add(initialHolderAmount));
                expect(balancerecipient).to.be.bignumber.equal(recipientAmount.sub(initialHolderAmount));

                await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

                const farmedinitialHolderPer2Week = farmedinitialHolderPerWeek.add(farmingAmount.divn(2).mul(balanceinitialHolder).div(balanceinitialHolder.add(balancerecipient)));
                const farmedrecipientPer2Week = farmedrecipientPerWeek.add(farmingAmount.divn(2).mul(balancerecipient).div(balanceinitialHolder.add(balancerecipient)));
                expect(await this.token.farmed(this.farm.address, initialHolder)).to.be.bignumber.almostEqual(farmedinitialHolderPer2Week);
                expect(await this.token.farmed(this.farm.address, recipient)).to.be.bignumber.almostEqual(farmedrecipientPer2Week);
                console.log(`farmed after week {initialHolder, recipient} = {${farmedinitialHolderPerWeek.toString()}, ${farmedrecipientPerWeek.toString()}}`);
                console.log(`farmed after transfer and additional week {initialHolder, recipient} = {${farmedinitialHolderPer2Week.toString()}, ${farmedrecipientPer2Week.toString()}}`);

                expect(farmedinitialHolderPer2Week.sub(farmedinitialHolderPerWeek)).to.be.bignumber.equal(farmedrecipientPer2Week.sub(farmedrecipientPerWeek));
            });
        });
    });
}

module.exports = {
    shouldBehaveLikeFarmable,
};
