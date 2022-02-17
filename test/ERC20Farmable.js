const { expectRevert, time, BN } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const ERC20FarmableMock = artifacts.require('ERC20FarmableMock');
const Farm = artifacts.require('Farm');
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

contract('ERC20Farmable', function ([wallet1, wallet2, wallet3]) {
    beforeEach(async function () {
        this.token = await ERC20FarmableMock.new('1INCH', '1INCH');
        this.gift = await TokenMock.new('UDSC', 'USDC');
        this.farm = await Farm.new(this.token.address, this.gift.address);

        for (const wallet of [wallet1, wallet2, wallet3]) {
            await this.gift.mint(wallet, '1000000000');
            await this.gift.approve(this.farm.address, '1000000000', { from: wallet });
        }

        await this.farm.setDistributor(wallet1, { from: wallet1 });

        this.started = (await time.latest()).addn(10);
        await timeIncreaseTo(this.started);
    });

    /*
        Farm initialization scenarios
    */
    describe('startFarming', async function () {
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
        it('should throw with rewards distribution access denied ', async function () {
            await expectRevert(
                this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
                'F: access denied',
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
        it('should throw with period too large', async function () {
            await expectRevert(
                this.farm.startFarming('10000', (new BN(2)).pow(new BN(40)), { from: wallet1 }),
                'FA: period too large',
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
        it('should throw with amount too large', async function () {
            const largeAmount = (new BN(2)).pow(new BN(192));
            await this.gift.mint(wallet1, largeAmount, { from: wallet1 });
            await this.gift.approve(this.farm.address, largeAmount, { from: wallet1 });
            await expectRevert(
                this.farm.startFarming(largeAmount, time.duration.weeks(1), { from: wallet1 }),
                'FA: amount too large',
            );
        });
    });

    /*
        Wallet joining scenarios
     */
    describe('Farm\'s total supply', async function () {
        /*
            ***Test Scenario**
            Checks if farm's total supply is updated after a wallet joins

            ***Initial setup**
            - `wallet1` has 1000 unit of farmable token but has not joined the farm

            ***Test Steps**
            `wallet1` joins the farm

            ***Expected results**
            Farm's total supply equals 1000
         */
        it('should update totalSupply', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('1000');
        });

        /*
            ***Test Scenario**
            Checks if farm's total supply is decreased after a wallet balance decreased
            ***Initial setup**
            - `wallet1` has 1000 unit of farmable token and joined the farm
            - `wallet2` has no farmable token and hasn't joined the farm

            ***Test Steps**
            Transfer 600 units from `wallet1` to `wallet2`
            ***Expected results**
            Farm's total supply decreased and equals to 400
         */
        it('should make totalSupply to decrease with balance', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.transfer(wallet2, '600', { from: wallet1 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('400');
        });

        /*
            ***Test Scenario**
            Checks if farm's total supply is increased after a wallet balance increased
            ***Initial setup**
            - `wallet1` has 1000 unit of farmable token and joined the farm
            - `wallet2` has 1000 unit of farmable token and hasn't joined the farm

            ***Test Steps**
            Transfer 500 units from `wallet2` to `wallet1`
            ***Expected results**
            Farm's total supply increased and equals to 1500
         */
        it('should make totalSupply to increase with balance', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.mint(wallet2, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.transfer(wallet1, '500', { from: wallet2 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('1500');
        });

        /*
            ***Test Scenario**
            Checks if farm's total supply is unchaged after a transfer between farming wallets
            ***Initial setup**
            - `wallet1` has 1000 unit of farmable token and joined the farm
            - `wallet2` has 1000 unit of farmable token and joined the farm

            ***Test Steps**
            Transfer 500 units from `wallet1` to `wallet2`
            ***Expected results**
            Farm's total supply remains unchanged and equals to 400
         */
        it('should make totalSupply ignore internal transfers', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.mint(wallet2, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });
            await this.token.transfer(wallet1, '500', { from: wallet2 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('2000');
        });

        /*
            ***Test Scenario**
            Ensure that wallet can't join the same farm twice
            ***Initial setup**
            - `wallet1` has 1000 unit of farmable token and has joined the farm

            ***Test Steps**
            Join `wallet1` to the farm
            ***Expected results**
            Reverts with error `'ERC20Farmable: already farming'`
         */
        it('should be thrown', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await expectRevert(
                this.token.join(this.farm.address, { from: wallet1 }),
                'ERC20Farmable: already farming',
            );
        });
    });

    // Farm's claim scenarios
    describe('claimFor', async function () {
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
        it('should thrown with access denied', async function () {
            await expectRevert(
                this.farm.claimFor(wallet1, '1000', { from: wallet1 }),
                'ERC20: access denied',
            );
        });
    });

    // Token's claim scenarios
    describe('claim', async function () {
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
            `wallet1` gift token balance equals 1000
        */
        it('should claim tokens', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

            await this.farm.startFarming(1000, 60 * 60 * 24);
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
        it('should claim tokens for non-farming wallet', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

            await this.farm.startFarming(1000, 60 * 60 * 24);
            await timeIncreaseTo(this.started.addn(60 * 60 * 25));
        
            const balanceBefore = await this.gift.balanceOf(wallet2);
            await this.token.claim(this.farm.address, { from: wallet2 });
            expect(await this.gift.balanceOf(wallet2)).to.be.bignumber.equal(balanceBefore);
        });
    });

    // Check all farms a user is farming scenarios
    describe('userFarms', async function () {
        /*
            ***Test Scenario**
            Check farms list a user farming is returned correctly for the wallet

            ***Initial setup**
            `wallet1` has 1000 unit of farmable token and joined the only farm
            
            ***Test Steps**
            Get all farms for `wallet1`

            ***Expected results**
            - Number of farms returned is 1
            - Address of the farm is the farm's address `wallet1` joined during setup
        */
        it('should return user farms', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            const wallet1farms = await this.token.userFarms(wallet1);
            expect(wallet1farms.length).to.be.equal(1);
            expect(wallet1farms[0]).to.be.equal(this.farm.address);
        });
    });

    // Tokens farming exit scenarios
    describe('exit', async function () {
        /*
            ***Test Scenario**
            Checks that farm's total supply decreases after a user quits farming

            ***Initial setup**
            - `farm` has not started farming
            - `wallet1` has 1000 unit of farmable token and joined the `farm`

            ***Test Steps**
            `wallet1` quits the `farm`

            ***Expected results**
            Farm's total supply equals 0
         */
        it('should be burnt', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.quit(this.farm.address, { from: wallet1 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.equal('0');
        });

        /*
            ***Test Scenario**
            Check that wallet can't quit a farm that it doesn't participate

            ***Initial setup**
            `wallet1` has not joined any farm

            ***Test Steps**
            Quit `wallet1` from the `farm`

            ***Expected results**
            Reverts with error `'ERC20Farmable: already exited'`
         */
        it('should be thrown', async function () {
            await expectRevert(
                this.token.quit(this.farm.address, { from: wallet1 }),
                'ERC20Farmable: already exited',
            );
        });

        /*
            ***Test Scenario**
            Check that wallet can't quit a farm twice in a row

            ***Initial setup**
            `wallet1` has joined the `farm`

            ***Test Steps**
            1. Quit `wallet1` from the `farm`
            1. Quit `wallet1` from the `farm`

            ***Expected results**
            Reverts with error `'ERC20Farmable: already exited'`
         */
        it('should not quit twice', async function () {
            await this.token.mint(wallet1, '1000');
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.quit(this.farm.address, { from: wallet1 });

            await expectRevert(
                this.token.quit(this.farm.address, { from: wallet1 }),
                'ERC20Farmable: already exited',
            );
        });
    });

    // Farming reward calculations scenarios
    describe('deposit', async function () {
        /*
            ***Test Scenario**
            Staker without farming tokens joins on 1st week and adds them on 2nd
            ```
            72k => 1x: +       +-------+ => 36k
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **2 weeks**
            - `wallet1` has no farmable token and joined the `farm`

            ***Test Steps**
            1. Fast-forward to 1 week end
            2. `wallet1` get 1 farming token
            3. Fast-forward to 2 week

            ***Expected results**
            After step 1 - farmed reward = 0
            After step 3 - farmed reward = 36k
         */
        it('Staker w/o tokens joins on 1st week and adds token on 2nd', async function () {
            await this.farm.startFarming('72000', time.duration.weeks(2), { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            
            await this.token.join(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            
            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('0');

            await this.token.mint(wallet1, '1');
            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('36000');
        });

        /*
            ***Test Scenario**
            Two stakers with the same stakes wait 1w
            ```
            72k => 1x: +-------+  => 36k
            #      1x: +-------+  => 36k
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 1 farmable token and joined the `farm`

            ***Test Steps**
            Fast-forward to week 1 end

            ***Expected results**
            `wallet1` farmed reward is 36k
            `wallet2` farmed reward is 36k
         */
        it('Two stakers with the same stakes wait 1 w', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '1');

            // 72000 UDSC per week for 1 week
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('36000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('36000');
        });

        /*
            ***Test Scenario**
            Two stakers with the same stakes wait 1w
            ```
            72k => 1x: +-------+  => 18k
            #      3x: +-------+  => 54k
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`

            ***Test Steps**
            Fast-forward to week 1 end

            ***Expected results**
            `wallet1` farmed reward is 18k
            `wallet2` farmed reward is 54k
         */
        it('Two stakers with the different (1:3) stakes wait 1 w', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');

            // 72000 UDSC per week
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('54000');
        });

        /*
            ==TODO: REMOVE TEST. FULL COPY OF 'Two stakers with the different (1:3) stakes wait 1 w'==
            ***Test Scenario**
            Two stakers with the same stakes wait 1w
            ```
            10k => 1x: +-------+  => 18k
            #      3x: +-------+  => 54k
            ```

            ***Initial setup**
            - `farm` has started farming **10k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`

            ***Test Steps**
            Fast-forward to week 1 end

            ***Expected results**
            `wallet1` farmed reward is 2500
            `wallet2` farmed reward is 7500
         */
        it('Notify Reward Amount from mocked distribution to 10,000', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');

            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('2500');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('7500');
        });

        /*
            ***Test Scenario**
            Two stakers with the different (1:3) stakes wait 2 weeks
            ```
            72k => 1x: +--------+ 72k => 1x: +--------+ => 72k for 1w + 18k for 2w
            #      0x:                   3x: +--------+ =>  0k for 1w + 54k for 2w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and has not joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |Fast-forward => **week 1**                 |72k|0|
            |2. |`wallet2` joins the `farm`                 |72k|0|
            |3. |`farm` starts new farming 72k for 1 week   |72k|0|
            |4. |Fast-forward => **week 2**                 |90k|54k|

        */
        it('Two stakers with the different (1:3) stakes wait 2 weeks', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');

            // 72000 UDSC per week
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            expect(await this.token.farmTotalSupply(this.farm.address)).to.be.bignumber.almostEqual('1');

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            await this.token.join(this.farm.address, { from: wallet2 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('0');

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('90000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('54000');
        });

        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap
            ```
            72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|
            |---|----------|---------|
            |1. |Fast-forward => **week 1**                 |72k|
            |2. |Fast-forward => **week 2**                 |72k|
            |3. |`farm` starts new farming 72k for 1 week   |72k|
            |4. |Fast-forward => **week 3**                 |144k|
            
         */
        it('One staker on 1st and 3rd weeks farming with gap', async function () {
            await this.token.mint(wallet1, '1');
            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('144000');
        });

        /*
            ==TODO: REMOVE TEST. POSSIBLE COPY OF 'One staker on 1st and 3rd weeks farming with gap'==
            ***Test Scenario**
            One staker on 2 durations with gap
            ```
            72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|
            |---|----------|---------|
            |1. |Fast-forward => **week 2**                 |72k|
            |3. |`farm` starts new farming 72k for 1 week   |72k|
            |4. |Fast-forward => **week 3**                 |144k|
            
         */
        it('One staker on 2 durations with gap', async function () {
            await this.token.mint(wallet1, '1');
            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('144000');
        });
        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap and claims in the middle
            ```
            72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|
            |---|----------|---------|
            |1. |Fast-forward => **week 1**                 |72k|
            |2. |Claim reward for `wallet1`                 |0  |
            |2. |Fast-forward => **week 2**                 |0|
            |3. |`farm` starts new farming 72k for 1 week   |0|
            |4. |Fast-forward => **week 3**                 |72k|

         */
        it('One staker on 1st and 3rd weeks farming with gap + claim in the middle', async function () {
            await this.token.mint(wallet1, '1');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            await this.token.claim(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
        });

        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap and exits and rejoins in the middle
            ```
            72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|
            |---|----------|---------|
            |1. |Fast-forward => **week 1**                 |72k|
            |2. |`wallet1` quits `farm`                     |72k|
            |3. |`wallet1` joins `farm`                     |72k|
            |4. |Fast-forward => **week 2**                 |72k|
            |5. |`farm` starts new farming 72k for 1 week   |72k|
            |6. |Fast-forward => **week 3**                 |144k|

         */
        it('One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle', async function () {
            await this.token.mint(wallet1, '1');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            await this.token.quit(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            await this.token.join(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('144000');
        });

        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap and exits and rejoins in the middle
            ```
            72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|
            |---|----------|---------|
            |1. |Fast-forward => **week 1**                 |72k|
            |2. |`wallet1` quits `farm`                     |72k|
            |3. |`wallet1` claims farming reward            |0k|
            |4. |`wallet1` joins `farm`                     |0k|
            |5. |Fast-forward => **week 2**                 |0k|
            |6. |`farm` starts new farming 72k for 1 week   |72k|
            |7. |Fast-forward => **week 3**                 |72k|

        */
        it('One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle', async function () {
            await this.token.mint(wallet1, '1');

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            await this.token.quit(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            await this.token.claim(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('0');
            await this.token.join(this.farm.address, { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // 72000 UDSC per week for 1 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('72000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('0');
        });

        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap and exits and rejoins in the middle
            ```
            1x: 72k =>  +-------+ 72k => +-------+ 72k => +-------+ = 18k for 1w +  8k for 2w + 12k for 3w
            3x:         +-------+        +-------+                  = 54k for 1w + 24k for 2w +  0k for 3w
            5x:                          +-------+        +-------+ =  0k for 1w + 40k for 2w + 60k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **1 week**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`
            - `wallet3` has 5 farmable token and hasn't joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|`wallet3`|
            |---|----------|---------|---------|---------|
            |1. |Fast-forward => **week 1**                 |18k|54k|0|
            |2. |`wallet3` joins `farm`                     |18k|54k|0|
            |3. |`farm` starts new farming 72k for 1 week   |18k|54k|0|
            |4. |Fast-forward => **week 2**                 |26k|78k|40k|
            |5. |`wallet2` quits `farm`                     |26k|78k|40k|
            |6. |`farm` starts new farming 72k for 1 week   |26k|78k|40k|
            |7. |Fast-forward => **week 3**                 |38k|78k|100k|

        */
        it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');
            await this.token.mint(wallet3, '5');

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            await this.token.join(this.farm.address, { from: wallet3 });

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('54000');

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('26000'); // 18k + 8k
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('26000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('78000');
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('40000');

            await this.token.quit(this.farm.address, { from: wallet2 });

            await this.farm.startFarming('72000', time.duration.weeks(1), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('38000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('78000');
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('100000');
        });

        /*
            ***Test Scenario**
            One staker on 1st and 3rd weeks farming with gap and exits and rejoins in the middle
            ```
            1x: 216k => +---------------------+ = 18k for 1w +  8k for 2w + 12k for 3w
            3x:         +--------------+        = 54k for 1w + 24k for 2w +  0k for 3w
            5x:                +--------------+ =  0k for 1w + 40k for 2w + 60k for 3w
            ```

            ***Initial setup**
            - `farm` has started farming **216k** for **3 weeks**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`
            - `wallet3` has 5 farmable token and hasn't joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|`wallet3`|
            |---|----------|---------|---------|---------|
            |1. |Fast-forward => **week 1**                 |18k|54k|0|
            |2. |`wallet3` joins `farm`                     |18k|54k|0|
            |3. |Fast-forward => **week 2**                 |26k|78k|40k|
            |4. |`wallet2` quits `farm`                     |26k|78k|40k|
            |5. |Fast-forward => **week 3**                 |38k|78k|100k|

        */
        it('Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');
            await this.token.mint(wallet3, '5');

            // 72000 UDSC per week for 3 weeks
            await this.farm.startFarming('216000', time.duration.weeks(3), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            await this.token.join(this.farm.address, { from: wallet3 });

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('54000');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            await this.token.quit(this.farm.address, { from: wallet2 });

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('26000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('78000');
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('40000');

            await timeIncreaseTo(this.started.add(time.duration.weeks(3)));

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('38000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('78000');
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('100000');
        });

        /*
            ***Test Scenario**
            Add more farming reward before previous farming finished
            ```
            1x: 10k => +-------+ = 2750 for 1w
            3x:  1k => +-------+ = 8250 for 1w
            ```

            ***Initial setup**
            - `farm` has started farming **10k** for **1 weeks**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |`farm` starts new farming 1k for 1 week    |0|0|
            |2. |Fast-forward => **week 1**                 |2720|8250|

        */
        it('Notify Reward Amount before prev farming finished', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');

            // 10000 UDSC per week for 1 weeks
            await this.farm.startFarming('10000', time.duration.weeks(1), { from: wallet1 });
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.equal('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.equal('0');

            // 1000 UDSC per week for 1 weeks
            await this.farm.startFarming('1000', time.duration.weeks(1), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('2750');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('8250');
        });
    });

    // Token transfer scenarios
    describe('transfers', async function () {
        /*
            ***Test Scenario**
            Transfer from one wallet to another, both are farming
            ```
            72k => 2x: +-------+ 1х: +--------+   = 9k  for 1w + 27k for 2w = 36
            #      1x: +-------+ 2x: +--------+   = 27k for 1w +  9k for 2w = 36
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **2 weeks**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 3 farmable token and joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |Fast-forward => **week 1**                             |9k|27k|
            |2. |Transfer 2 farmable tokens from `wallet2` to `wallet1` |9k|27k|
            |3. |Fast-forward => **week 2**                             |36k|36k|

        */
        it('Transfer from one wallet to another, both farming', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '3');

            // 36000 UDSC per week for 2 weeks
            await this.farm.startFarming('72000', time.duration.weeks(2), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('9000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('27000');

            await this.token.transfer(wallet1, '2', { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('36000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('36000');
        });

        // ```
        // 1x: +-------+--------+   = 18k for 1w + 36k for 2w
        // 1x: +-------+            = 18k for 1w +  0k for 2w
        // ```
        /*
            ***Test Scenario**
            Transfer from one wallet to another, sender is farming, reciever is not farming
            ```
            72k => 1x: +-------+ 1х: +--------+   = 9k  for 1w + 27k for 2w = 36
            #      1x: +-------+ 0x: +        +   = 27k for 1w +  9k for 2w = 36
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **2 weeks**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 1 farmable token and joined the `farm`
            - `wallet3` has no farmable token and hasn't joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |Fast-forward => **week 1**                             |18k|18k|
            |2. |Transfer 2 farmable tokens from `wallet2` to `wallet3` |18k|18k|
            |3. |Fast-forward => **week 2**                             |54k|18k|

        */
        it('Transfer from one wallet to another, sender is farming, reciever is not farming', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '1');

            // 36000 UDSC per week for 2 weeks
            await this.farm.startFarming('72000', time.duration.weeks(2), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('18000');

            await this.token.transfer(wallet3, '1', { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // expect(await this.token.farmedPerToken()).to.be.bignumber.almostEqual('38000'); // 18k + 8k + 12k
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('54000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('18000');
        });

        /*
            ***Test Scenario**
            Transfer farming token to farming wallet in the middle of farming
            ```
            72k => 1x: +-------+ 3х: +--------+   = 18k  for 1w + 27k for 2w = 36
            #      1x: +-------+ 1x: +--------+   = 18k for 1w +  9k for 2w = 36
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **2 weeks**
            - `wallet1` has 1 farmable token and joined the `farm`
            - `wallet2` has 1 farmable token and joined the `farm`
            - `wallet3` has 2 farmable token and hasn't joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |Fast-forward => **week 1**                             |18k|18k|
            |2. |Transfer 2 farmable tokens from `wallet3` to `wallet1` |18k|18k|
            |3. |Fast-forward => **week 2**                             |45k|27k|

        */
        it('Transfer from one wallet to another, sender is not farming, reciever is farming', async function () {
            await this.token.mint(wallet1, '1');
            await this.token.mint(wallet2, '1');
            await this.token.mint(wallet3, '2');

            // 36000 UDSC per week for 2 weeks
            await this.farm.startFarming('72000', time.duration.weeks(2), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('18000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('18000');

            await this.token.transfer(wallet1, '2', { from: wallet3 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('45000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('27000');
        });

        /*
            ***Test Scenario**
            Transfer from one wallet to another, both are not farming
            ```
            72k => 0x: +       + 1х: +--------+   = 0k for 1w +  9k for 2w
            #      0x: +       + 3x: +--------+   = 0k for 1w + 27k for 2w
            ```

            ***Initial setup**
            - `farm` has started farming **72k** for **2 weeks**
            - `wallet1` has 1 farmable token and has not joined the `farm`
            - `wallet2` has 1 farmable token and has not joined the `farm`

            ***Test steps and expected rewards**
            |#  |Test Steps|`wallet1`|`wallet2`|
            |---|----------|---------|---------|
            |1. |Fast-forward => **week 1**                             |0|0|
            |3. |Transfer 3 from `wallet1` to `wallet2`                 |0|0|
            |2. |`wallet1` and `wallet2` join the `farm`                |0|0|
            |4. |Fast-forward => **week 2**                             |9k|27k|

        */
        it('Transfer from one wallet to another, both are not farming', async function () {
            await this.token.mint(wallet1, '4');

            await this.farm.startFarming('72000', time.duration.weeks(2), { from: wallet1 });
            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('0');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('0');

            await this.token.transfer(wallet2, '3', { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual('9000');
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual('27000');
        });
    });

    // ==TODO: Merge with 'transfers'==
    describe('transfer', async function () {
        const farmingAmount = new BN('72000');
        const wallet1Amount = new BN('1');
        const wallet2Amount = new BN('3');
        const wallet3Amount = new BN('1');

        // ==TODO: REMOVE AS COPY OF 'Transfer from one wallet to another, sender is not farming, reciever is farming'==
        it('should be correct farming after transfered from non-farm user to farm user', async function () {
            await this.token.mint(wallet1, wallet1Amount);
            await this.token.mint(wallet2, wallet2Amount);

            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            // farmedWalletPerWeek = farmingAmount / 2 * wallet1Amount / (wallet1Amount + wallet2Amount)
            const farmedWallet1PerWeek = farmingAmount.divn(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.divn(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('0');

            await this.token.mint(wallet3, wallet3Amount);
            await this.token.transfer(wallet1, wallet3Amount, { from: wallet3 });
            await this.token.join(this.farm.address, { from: wallet3 });

            const balanceWallet1 = await this.token.balanceOf(wallet1);
            const balanceWallet2 = await this.token.balanceOf(wallet2);
            const balanceWallet3 = await this.token.balanceOf(wallet3);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount.add(wallet3Amount));
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount);
            expect(balanceWallet3).to.be.bignumber.equal('0');

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            // farmedWalletPer2Week = farmedWalletPerWeek + farmingAmount / 2 * balanceWallet2 / (balanceWallet1 + balanceWallet2);
            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            expect(await this.token.farmed(this.farm.address, wallet3)).to.be.bignumber.almostEqual('0');
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        // ==TODO: REMOVE AS COPY OF 'Transfer from one wallet to another, both farming'==
        // there is an error in title, both wallets are farming in the test
        it('should be correct farming after transfered from farm user to non-farm user', async function () {
            await this.token.mint(wallet1, wallet1Amount.add(wallet2Amount));

            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.divn(2);
            const farmedWallet2PerWeek = new BN('0');
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);

            await this.token.transfer(wallet2, wallet2Amount, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            const balanceWallet1 = await this.token.balanceOf(wallet1);
            const balanceWallet2 = await this.token.balanceOf(wallet2);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount);
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount);

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);
        });

        // ==TODO: REMOVE AS COPY OF 'Transfer from one wallet to another, both farming'==
        it('should be correct farming after transfered from farm user to farm user', async function () {
            await this.token.mint(wallet1, wallet1Amount);
            await this.token.mint(wallet2, wallet2Amount);

            await this.farm.startFarming(farmingAmount, time.duration.weeks(2), { from: wallet1 });

            await this.token.join(this.farm.address, { from: wallet1 });
            await this.token.join(this.farm.address, { from: wallet2 });

            await timeIncreaseTo(this.started.add(time.duration.weeks(1)));

            const farmedWallet1PerWeek = farmingAmount.divn(2).mul(wallet1Amount).div(wallet1Amount.add(wallet2Amount));
            const farmedWallet2PerWeek = farmingAmount.divn(2).mul(wallet2Amount).div(wallet1Amount.add(wallet2Amount));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1PerWeek);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2PerWeek);

            await this.token.transfer(wallet1, wallet1Amount, { from: wallet2 });

            const balanceWallet1 = await this.token.balanceOf(wallet1);
            const balanceWallet2 = await this.token.balanceOf(wallet2);
            expect(balanceWallet1).to.be.bignumber.equal(wallet1Amount.add(wallet1Amount));
            expect(balanceWallet2).to.be.bignumber.equal(wallet2Amount.sub(wallet1Amount));

            await timeIncreaseTo(this.started.add(time.duration.weeks(2)));

            const farmedWallet1Per2Week = farmedWallet1PerWeek.add(farmingAmount.divn(2).mul(balanceWallet1).div(balanceWallet1.add(balanceWallet2)));
            const farmedWallet2Per2Week = farmedWallet2PerWeek.add(farmingAmount.divn(2).mul(balanceWallet2).div(balanceWallet1.add(balanceWallet2)));
            expect(await this.token.farmed(this.farm.address, wallet1)).to.be.bignumber.almostEqual(farmedWallet1Per2Week);
            expect(await this.token.farmed(this.farm.address, wallet2)).to.be.bignumber.almostEqual(farmedWallet2Per2Week);
            console.log(`farmed after week {wallet1, wallet2} = {${farmedWallet1PerWeek.toString()}, ${farmedWallet2PerWeek.toString()}}`);
            console.log(`farmed after transfer and additional week {wallet1, wallet2} = {${farmedWallet1Per2Week.toString()}, ${farmedWallet2Per2Week.toString()}}`);

            expect(farmedWallet1Per2Week.sub(farmedWallet1PerWeek)).to.be.bignumber.equal(farmedWallet2Per2Week.sub(farmedWallet2PerWeek));
        });
    });
});
