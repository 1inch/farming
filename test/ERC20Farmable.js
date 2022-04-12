const { expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { toBN } = require('@1inch/solidity-utils');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual } = require('./utils');
const { shouldBehaveLikeFarmable } = require('./behaviors/ERC20Farmable.behavior.js');

const ERC20FarmableMock = artifacts.require('ERC20FarmableMock');
const Farm = artifacts.require('Farm');
const TokenMock = artifacts.require('TokenMock');

require('chai').use(function (chai, utils) {
    chai.Assertion.overwriteMethod('almostEqual', (original) => {
        return function (value) {
            if (utils.flag(this, 'bignumber')) {
                const expected = toBN(value);
                const actual = toBN(this._obj);
                almostEqual.apply(this, [expected, actual]);
            } else {
                original.apply(this, arguments);
            }
        };
    });
});

describe('ERC20Farmable', function () {
    let wallet1, wallet2, wallet3;
    const initialSupply = ether('1.0');
    const maxUserFarms = 10;

    before(async () => {
        [wallet1, wallet2, wallet3] = await web3.eth.getAccounts();
    });

    beforeEach(async () => {
        this.token = await ERC20FarmableMock.new('1INCH', '1INCH', maxUserFarms);
        await this.token.mint(wallet1, initialSupply);

        this.gift = await TokenMock.new('UDSC', 'USDC', '0');
        this.farm = await Farm.new(this.token.address, this.gift.address);
    });

    shouldBehaveLikeFarmable(() => ({
        initialSupply,
        initialHolder: wallet1,
        recipient: wallet2,
        anotherAccount: wallet3,
        token: this.token,
        farm: this.farm,
        gift: this.gift,
    }));

    // Generic farming scenarios
    describe('farming', async () => {
        beforeEach(async () => {
            this.gift = await TokenMock.new('UDSC', 'USDC', '0');
            this.farm = await Farm.new(this.token.address, this.gift.address);

            for (const wallet of [wallet1, wallet2, wallet3]) {
                await this.gift.mint(wallet, '1000000000');
                await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
            }

            await this.farm.setDistributor(wallet1);

            this.started = (await time.latest()).addn(10);
            await timeIncreaseTo(this.started);
        });

        // Farm initialization scenarios
        describe('startFarming', async () => {
            /*
                ***Test Scenario**
                Checks that only distributor may launch farming. "Distributor" is the only account that offers farming reward.
                ***Initial setup**
                - `wallet1` - distributor account
                - `wallet2` - non-distributor account

                ***Test Steps**
                Start farming using `wallet2`
                ***Expected results**
                Revert with error `'F: access denied'`.
            */
            it('should thrown with rewards distribution access denied ', async () => {
                await expectRevert(
                    this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
                    'F: start access denied',
                );
            });

            /*
                ***Test Scenario**
                Check that farming period is of `uint40` size.

                ***Test Steps**
                Start farming using 2^40^ as farming period.

                ***Expected results**
                Revert with error `'FA: period too large'`.
            */
            it('Thrown with Period too large', async () => {
                await expectRevert(
                    this.farm.startFarming('10000', (toBN(2)).pow(toBN(40)), { from: wallet1 }),
                    'FA: duration too large',
                );
            });

            /*
                ***Test Scenario**
                Check that farming amount is under `uint192`

                ***Test Steps**
                Start farming using 2^192^ as farming reward.

                ***Expected results**
                Revert with error `'FA: amount too large'`.
            */
            it('Thrown with Amount too large', async () => {
                const largeAmount = (toBN(2)).pow(toBN(192));
                await this.gift.mint(wallet1, largeAmount);
                await this.gift.approve(this.farm.address, largeAmount);
                await expectRevert(
                    this.farm.startFarming(largeAmount, time.duration.weeks(1), { from: wallet1 }),
                    'FA: amount too large',
                );
            });
        });

        // Token's claim scenarios
        describe('claim', async () => {
            /*
                ***Test Scenario**
                Checks that farming reward can be claimed with the regular scenario 'join - farm - claim'.
                ***Initial setup**
                - `farm` started farming for 1 day with 1000 units reward
                - `wallet1` has 1000 unit of farmable token and joined the farm

                ***Test Steps**
                1. Fast-forward time to 1 day and 1 hour
                2. Claim reward for `wallet1`

                ***Expected results**
                `wallet1` reward token balance equals 1000
            */
            it('should claim tokens', async () => {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                await this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });
                await timeIncreaseTo(this.started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet1);
                await this.token.claim(this.farm.address, { from: wallet1 });
                expect(await this.gift.balanceOf(wallet1)).to.be.bignumber.equal(balanceBefore.addn(1000));
            });

            /*
                ***Test Scenario**
                Checks that non-farming wallet doesn't get a reward
                ***Initial setup**
                - `farm` started farming for 1 day with 1000 units reward
                - `wallet1` has 1000 unit of farmable token and joined the farm
                - `wallet2` hasn't joined the farm

                ***Test Steps**
                1. Fast-forward time to 1 day and 1 hour
                2. Claim reward for `wallet2`

                ***Expected results**
                `wallet2` gift token balance doesn't change after claim
            */
            it('should claim tokens for non-user farms wallet', async () => {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                await this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });
                await timeIncreaseTo(this.started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet2);
                await this.token.claim(this.farm.address, { from: wallet2 });
                expect(await this.gift.balanceOf(wallet2)).to.be.bignumber.equal(balanceBefore);
            });
        });

        // Farm's claim scenarios
        describe('claimFor', async () => {
            /*
                ***Test Scenario**
                Ensure that `claimFor` can be called only by farmable token contract
                ***Initial setup**
                - `wallet1` has 1000 unit of farmable token and joined the farm
                - `wallet2` has 1000 unit of farmable token and joined the farm

                ***Test Steps**
                Call farm's `claimFor` for `wallet1`

                ***Expected results**
                Revert with error `'ERC20: access denied'`
            */
            it('should thrown with access denied', async () => {
                await expectRevert(
                    this.farm.claimFor(wallet1, '1000', { from: wallet1 }),
                    'F: claimFor access denied',
                );
            });
        });
    });
});
