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

const shouldBehaveLikeFarmable = (getContext) => {
    // Behavior test scenarios
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

        // Wallet joining scenarios
        describe('farm', async () => {
            const createFarm = async () => {
                const gift = await TokenMock.new('GIFT', 'GIFT', '0');
                return await Farm.new(ctx.token.address, gift.address);
            };

            const joinMaxFarms = async (from) => {
                const maxUserFarms = await ctx.token.maxUserFarms();
                for (let i = 0; i < maxUserFarms; i++) {
                    const farm = await createFarm();
                    await ctx.token.join(farm.address, { from });
                }
                return maxUserFarms;
            };

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
            it('should update totalSupply', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
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
            it('should make totalSupply to decrease with balance', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.muln(6).divn(10), { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply.muln(4).divn(10));
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
            it('should make totalSupply to increase with balance', async () => {
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply.divn(2));
                await ctx.token.transfer(ctx.initialHolder, ctx.initialSupply.divn(2), { from: ctx.recipient });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
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
            it('should make totalSupply ignore internal transfers', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(2), { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal(ctx.initialSupply);
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
            it('should be thrown', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await expectRevert(
                    ctx.token.join(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20F: already farming',
                );
            });

            /*
                ***Test Scenario**
                Checks that a user cannot join more farms than allowed by token settings

                ***Initial Setup**
                A wallet has joined the maximum allowed number of farms

                ***Test steps**
                - The wallet joins one more farm

                ***Expected results**
                Reverts with error `'ERC20F: max user farms reached'`
             */
            it('should be thrown when user join farms more then can', async () => {
                await joinMaxFarms(ctx.initialHolder);
                await expectRevert(
                    ctx.token.join(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20F: max user farms reached',
                );
            });

            /*
                ***Test Scenario**
                Checks that a user can join farm if joined farm count equals the limit of allowed farms

                ***Initial Setup**
                A wallet has joined the maximum allowed number of farms

                ***Test steps**
                - The wallet exits one farm
                - The wallet joins a farm

                ***Expected results**
                The join operation succeeds
             */
            it('should be join farm after reached max and then exit from one', async () => {
                const maxUserFarms = await joinMaxFarms(ctx.initialHolder);
                let userFarms = await ctx.token.userFarms(ctx.initialHolder);
                expect(new BN(userFarms.length)).to.be.bignumber.equals(maxUserFarms);

                await ctx.token.quit(userFarms[0]);
                userFarms = await ctx.token.userFarms(ctx.initialHolder);
                expect(new BN(userFarms.length)).to.be.bignumber.equals(maxUserFarms.subn(1));

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                userFarms = await ctx.token.userFarms(ctx.initialHolder);
                expect(new BN(userFarms.length)).to.be.bignumber.equals(maxUserFarms);
            });
        });

        // Check all farms a user is farming scenarios
        describe('userFarms', async () => {
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
            it('should return user farms', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                const initialHolderFarms = await ctx.token.userFarms(ctx.initialHolder);
                expect(initialHolderFarms.length).to.be.equal(1);
                expect(initialHolderFarms[0]).to.be.equal(ctx.farm.address);
            });
        });

        // Tokens farming exit scenarios
        describe('exit', async () => {
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
            it('should be burn', async () => {
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder });
                expect(await ctx.token.farmTotalSupply(ctx.farm.address)).to.be.bignumber.equal('0');
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
            it('should be thrown', async () => {
                await expectRevert(
                    ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20F: already exited',
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
                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder });

                await expectRevert(
                    ctx.token.quit(ctx.farm.address, { from: ctx.initialHolder }),
                    'ERC20F: already exited',
                );
            });
        });

        // Farming reward calculations scenarios
        describe('deposit', async () => {
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
                2. `wallet1` gets farming tokens
                3. Fast-forward to 2 week

                ***Expected results**
                After step 1 - farmed reward = 0
                After step 3 - farmed reward = 36k
            */
            it('Staker w/o tokens joins on 1st week and adds token on 2nd', async function () {
                await ctx.farm.startFarming('72000', time.duration.weeks(2), { from: ctx.initialHolder });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');

                await ctx.token.transfer(ctx.recipient, ctx.initialSupply, { from: ctx.initialHolder });
                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('36000');
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

            /*
                ***Test Scenario**
                One staker on 1st and 3rd weeks farming with gap and exits, claims and rejoins in the middle
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

            /*
                ***Test Scenario**
                Three stakers with the different (1:3:5) stakes wait 3 weeks
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

            /*
                ***Test Scenario**
                Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event
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

        // Token transfer scenarios
        describe('transfers', async () => {
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
            it('Transfer from one wallet to another, sender is not farming, reciever is farming', async () => {
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
                |4. |Fast-forward => **week 2**                             |27k|9k|

            */
            it('Transfer from one wallet to another, both are not farming', async function () {
                await ctx.farm.startFarming('72000', time.duration.weeks(2), { from: ctx.initialHolder });

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(1)));

                await ctx.token.transfer(ctx.recipient, ctx.initialSupply.divn(4), { from: ctx.initialHolder });

                await ctx.token.join(ctx.farm.address, { from: ctx.initialHolder });
                await ctx.token.join(ctx.farm.address, { from: ctx.recipient });

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.equal('0');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.equal('0');

                await timeIncreaseTo(ctx.started.add(time.duration.weeks(2)));

                expect(await ctx.token.farmed(ctx.farm.address, ctx.initialHolder)).to.be.bignumber.almostEqual('27000');
                expect(await ctx.token.farmed(ctx.farm.address, ctx.recipient)).to.be.bignumber.almostEqual('9000');
            });
        });
    });
};

module.exports = {
    shouldBehaveLikeFarmable,
};
