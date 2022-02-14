const { expectRevert, time, BN, ether } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual } = require('./utils');
const { shouldBehaveLikeFarmable } = require('./behaviors/ERC20Farmable.behavior.js');

const ERC20FarmableMock = artifacts.require('ERC20FarmableMock');
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

contract('ERC20Farmable', function ([wallet1, wallet2, wallet3]) {
    const initialSupply = ether('1.0');

    beforeEach(async function () {
        this.token = await ERC20FarmableMock.new('1INCH', '1INCH');
        await this.token.mint(wallet1, initialSupply);
    });

    shouldBehaveLikeFarmable(initialSupply, wallet1, wallet2, wallet3);

    describe('farming', async function () {
        beforeEach(async function () {
            this.gift = await TokenMock.new('UDSC', 'USDC');
            this.farm = await Farm.new(this.token.address, this.gift.address);

            for (const wallet of [wallet1, wallet2, wallet3]) {
                await this.gift.mint(wallet, '1000000000');
                await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
            }

            await this.farm.setDistributor(wallet1);

            this.started = (await time.latest()).addn(10);
            await timeIncreaseTo(this.started);
        });

        describe('startFarming', async function () {
            it('should thrown with rewards distribution access denied ', async function () {
                await expectRevert(
                    this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
                    'F: access denied',
                );
            });

            it('Thrown with Period too large', async function () {
                await expectRevert(
                    this.farm.startFarming('10000', (new BN(2)).pow(new BN(40)), { from: wallet1 }),
                    'FA: period too large',
                );
            });

            it('Thrown with Amount too large', async function () {
                const largeAmount = (new BN(2)).pow(new BN(192));
                await this.gift.mint(wallet1, largeAmount);
                await this.gift.approve(this.farm.address, largeAmount);
                await expectRevert(
                    this.farm.startFarming(largeAmount, time.duration.weeks(1), { from: wallet1 }),
                    'FA: amount too large',
                );
            });
        });

        describe('claim', async function () {
            it('should claim tokens', async function () {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                await this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });
                await timeIncreaseTo(this.started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet1);
                await this.token.claim(this.farm.address, { from: wallet1 });
                expect(await this.gift.balanceOf(wallet1)).to.be.bignumber.equal(balanceBefore.addn(1000));
            });

            it('should claim tokens for non-user farms wallet', async function () {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                await this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });
                await timeIncreaseTo(this.started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet2);
                await this.token.claim(this.farm.address, { from: wallet2 });
                expect(await this.gift.balanceOf(wallet2)).to.be.bignumber.equal(balanceBefore);
            });
        });

        describe('claimFor', async function () {
            it('should thrown with access denied', async function () {
                await expectRevert(
                    this.farm.claimFor(wallet1, '1000', { from: wallet1 }),
                    'ERC20: access denied',
                );
            });
        });
    });
});
