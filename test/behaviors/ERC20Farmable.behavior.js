const { ether, expect, time } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { almostEqual, startFarming, joinNewFarms } = require('../utils');

require('chai').use(function (chai, utils) {
    chai.Assertion.overwriteMethod('almostEqual', function (original) {
        return function (value) {
            const expected = BigInt(value);
            const actual = BigInt(this._obj);
            almostEqual.apply(this, [expected, actual]);
        };
    });
});

function shouldBehaveLikeFarmable () {
    // Behavior test scenarios
    describe('should behave like farmable', function () {
        const INITIAL_SUPPLY = ether('1');
        const MAX_USER_FARMS = 10;
        let initialHolder;
        let recipient;
        let anotherAccount;

        before(async function () {
            [initialHolder, recipient, anotherAccount] = await ethers.getSigners();
        });

        async function initContracts () {
            const ERC20FarmableMock = await ethers.getContractFactory('ERC20FarmableMock');
            const token = await ERC20FarmableMock.deploy('1INCH', '1INCH', MAX_USER_FARMS);
            await token.deployed();
            await token.mint(initialHolder.address, INITIAL_SUPPLY);

            const TokenMock = await ethers.getContractFactory('TokenMock');
            const gift = await TokenMock.deploy('UDSC', 'USDC');
            await gift.deployed();

            const Farm = await ethers.getContractFactory('Farm');
            const farm = await Farm.deploy(token.address, gift.address);
            await farm.deployed();

            for (const wallet of [initialHolder, recipient, anotherAccount]) {
                await gift.mint(wallet.address, '1000000000');
                await gift.connect(wallet).approve(farm.address, '1000000000');
            }
            await farm.setDistributor(initialHolder.address);

            return { token, gift, farm };
        };

        // Wallet joining scenarios
        describe('farm', function () {
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
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY);
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
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                await token.transfer(recipient.address, INITIAL_SUPPLY * 6n / 10n);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY * 4n / 10n);
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
                const { token, farm } = await loadFixture(initContracts);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 2n);
                await token.addPod(farm.address);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY / 2n);
                await token.connect(recipient).transfer(initialHolder.address, INITIAL_SUPPLY / 2n);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY);
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
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 2n);
                expect(await farm.totalSupply()).to.equal(INITIAL_SUPPLY);
            });

            /*
                ***Test Scenario**
                Ensure that wallet can't join the same farm twice
                ***Initial setup**
                - `wallet1` has 1000 unit of farmable token and has joined the farm

                ***Test Steps**
                Join `wallet1` to the farm
                ***Expected results**
                Reverts with error `'AlreadyFarming()'`
            */
            it('should be thrown', async function () {
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                await expect(
                    token.addPod(farm.address),
                ).to.be.revertedWithCustomError(token, 'PodAlreadyAdded');
            });

            /*
                ***Test Scenario**
                Checks that a user cannot join more farms than allowed by token settings

                ***Initial Setup**
                A wallet has joined the maximum allowed number of farms

                ***Test steps**
                - The wallet joins one more farm

                ***Expected results**
                Reverts with error `'PodsLimitReachedForAccount()'`
             */
            it('should revert when user joins more than max allowed farms count', async function () {
                const { token, farm } = await loadFixture(initContracts);
                const podsLimit = await token.podsLimit();
                await joinNewFarms(token, podsLimit, initialHolder);
                await expect(
                    token.addPod(farm.address),
                ).to.be.revertedWithCustomError(token, 'PodsLimitReachedForAccount');
            });

            /*
                ***Test Scenario**
                Checks that a user can join farm if one removePod from 1 farm after have the maximum allowed farms

                ***Initial Setup**
                A wallet has joined the maximum allowed number of farms

                ***Test steps**
                - The wallet exits one farm
                - The wallet joins a farm

                ***Expected results**
                The join operation succeeds
             */
            it('should be join farm after reached max and then exit from one', async function () {
                const { token } = await loadFixture(initContracts);
                const podsLimit = await token.podsLimit();
                await joinNewFarms(token, podsLimit, initialHolder);
                let pods = await token.pods(initialHolder.address);
                expect(pods.length).to.equal(podsLimit);

                await token.removePod(pods[0]);
                pods = await token.pods(initialHolder.address);
                expect(pods.length).to.equal(podsLimit.sub(1));

                await joinNewFarms(token, 1, initialHolder);
                pods = await token.pods(initialHolder.address);
                expect(pods.length).to.equal(podsLimit);
            });
        });

        // Check all farms a user is farming scenarios
        describe('pods', function () {
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
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                const initialHolderFarms = await token.pods(initialHolder.address);
                expect(initialHolderFarms.length).to.equal(1);
                expect(initialHolderFarms[0]).to.equal(farm.address);
            });
        });

        // Tokens farming exit scenarios
        describe('exit', function () {
            /*
                ***Test Scenario**
                Checks that farm's total supply decreases after a user removePods farming

                ***Initial setup**
                - `farm` has not started farming
                - `wallet1` has 1000 unit of farmable token and joined the `farm`

                ***Test Steps**
                `wallet1` removePods the `farm`

                ***Expected results**
                Farm's total supply equals 0
            */
            it('should be burn', async function () {
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                await token.removePod(farm.address);
                expect(await farm.totalSupply()).to.equal('0');
            });

            /*
                ***Test Scenario**
                Check that wallet can't removePod a farm that it doesn't participate

                ***Initial setup**
                `wallet1` has not joined any farm

                ***Test Steps**
                Quit `wallet1` from the `farm`

                ***Expected results**
                Reverts with error `'AlreadyExited()'`
            */
            it('should be thrown', async function () {
                const { token, farm } = await loadFixture(initContracts);
                await expect(
                    token.removePod(farm.address),
                ).to.be.revertedWithCustomError(token, 'PodNotFound');
            });

            /*
                ***Test Scenario**
                Check that wallet can't removePod a farm twice in a row

                ***Initial setup**
                `wallet1` has joined the `farm`

                ***Test Steps**
                1. Quit `wallet1` from the `farm`
                1. Quit `wallet1` from the `farm`

                ***Expected results**
                Reverts with error `'AlreadyExited()'`
            */
            it('should not removePod twice', async function () {
                const { token, farm } = await loadFixture(initContracts);
                await token.addPod(farm.address);
                await token.removePod(farm.address);

                await expect(
                    token.removePod(farm.address),
                ).to.be.revertedWithCustomError(token, 'PodNotFound');
            });

            /*
                ***Test Scenario**
                Checks that a wallet can removePod from all farms using the `removeAllPods` function

                ***Initial setup**
                `wallet1` has joined the maximum allowed number of farms

                ***Test Steps**
                1. Call the `removePodeAll` function to exit from all farms
                2. Try to removePod each farm separately

                ***Expected results**
                - `wallet1` has not joined any farms after step 1.
                - Each exit attempt is reverted with an error `AlreadyExited()` at step 2.
            */
            it('should removePod all farms', async function () {
                const { token } = await loadFixture(initContracts);
                const podsLimit = await token.podsLimit();
                await joinNewFarms(token, podsLimit, initialHolder);
                await token.removeAllPods();
                expect(await token.podsCount(initialHolder.address)).to.equal('0');

                const farms = await token.pods(initialHolder.address);
                for (let i = 0; i < farms.length; i++) {
                    await expect(
                        token.removePod(farms[i].address),
                    ).to.be.revertedWithCustomError(token, 'PodNotFound');
                }
            });
        });

        // Farming reward calculations scenarios
        describe('deposit', function () {
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
                const { token, farm } = await loadFixture(initContracts);
                const started = await startFarming(farm, '72000', time.duration.weeks(2), initialHolder);
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await token.connect(recipient).addPod(farm.address);
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await time.increaseTo(started + time.duration.weeks(1));
                expect(await farm.farmed(initialHolder.address)).to.equal('0');

                await token.transfer(recipient.address, INITIAL_SUPPLY);
                await time.increaseTo(started + time.duration.weeks(2));
                expect(await farm.farmed(recipient.address)).to.almostEqual('36000');
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
                const { token, farm } = await loadFixture(initContracts);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 2n);

                // 72000 UDSC per week for 3 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                // expect(await token.farmedPerToken()).to.equal('0');
                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                // expect(await token.farmedPerToken()).to.equal('0');
                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await time.increaseTo(started + time.duration.weeks(1));

                // expect(await token.farmedPerToken()).to.almostEqual('36000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('36000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('36000');
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
                const { token, farm } = await loadFixture(initContracts);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 4n);

                // 72000 UDSC per week
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                // expect(await token.farmedPerToken()).to.equal('0');
                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                // expect(await token.farmedPerToken()).to.equal('0');
                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await time.increaseTo(started + time.duration.weeks(1));

                // expect(await token.farmedPerToken()).to.almostEqual('18000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('54000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('18000');
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
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +----------------+ = 72k for 1w + 18k for 2w
                // 3x:         +--------+ =  0k for 1w + 54k for 2w
                //
                const recipientAmount = INITIAL_SUPPLY * 3n / 4n;
                await token.transfer(recipient.address, recipientAmount);

                // 72000 UDSC per week
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);
                expect(await farm.totalSupply()).to.almostEqual(INITIAL_SUPPLY - recipientAmount);

                await time.increaseTo(started + time.duration.weeks(1));

                await token.connect(recipient).addPod(farm.address);

                // expect(await token.farmedPerToken()).to.almostEqual('72000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('0');

                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(2));

                // expect(await token.farmedPerToken()).to.almostEqual('90000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('90000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('54000');
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
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');

                await time.increaseTo(started + time.duration.weeks(2));

                // 72000 UDSC per week for 1 weeks
                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(3));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('144000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('0');
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
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                await farm.claim();
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('0');

                await time.increaseTo(started + time.duration.weeks(2));

                // 72000 UDSC per week for 1 weeks
                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(3));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('0');
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
                |2. |`wallet1` removePods `farm`                     |72k|
                |3. |`wallet1` joins `farm`                     |72k|
                |4. |Fast-forward => **week 2**                 |72k|
                |5. |`farm` starts new farming 72k for 1 week   |72k|
                |6. |Fast-forward => **week 3**                 |144k|

            */
            it('One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle', async function () {
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                await token.removePod(farm.address);
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                await token.addPod(farm.address);
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');

                await time.increaseTo(started + time.duration.weeks(2));

                // 72000 UDSC per week for 1 weeks
                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(3));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('144000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('0');
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
                |2. |`wallet1` removePods `farm`                     |72k|
                |3. |`wallet1` claims farming reward            |0k|
                |4. |`wallet1` joins `farm`                     |0k|
                |5. |Fast-forward => **week 2**                 |0k|
                |6. |`farm` starts new farming 72k for 1 week   |72k|
                |7. |Fast-forward => **week 3**                 |72k|

            */
            it('One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle', async function () {
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------+        +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
                //

                // 72000 UDSC per week for 1 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                await token.removePod(farm.address);
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                await farm.claim();
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('0');
                await token.addPod(farm.address);
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('0');

                await time.increaseTo(started + time.duration.weeks(2));

                // 72000 UDSC per week for 1 weeks
                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(3));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('72000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('0');
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
                |5. |`wallet2` removePods `farm`                     |26k|78k|40k|
                |6. |`farm` starts new farming 72k for 1 week   |26k|78k|40k|
                |7. |Fast-forward => **week 3**                 |38k|78k|100k|

            */
            it('Three stakers with the different (1:3:5) stakes wait 3 weeks', async function () {
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +----------------+--------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = INITIAL_SUPPLY / 3n;
                await token.transfer(recipient.address, recipientAmount);
                const anotherAccountAmount = INITIAL_SUPPLY * 5n / 9n;
                await token.transfer(anotherAccount.address, anotherAccountAmount);

                // 72000 UDSC per week for 3 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(1), initialHolder);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                await token.connect(anotherAccount).addPod(farm.address);

                // expect(await token.farmedPerToken()).to.almostEqual('18000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('18000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('54000');

                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(2));

                // expect(await token.farmedPerToken()).to.almostEqual('26000'); // 18k + 8k
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('26000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('78000');
                expect(await farm.farmed(anotherAccount.address)).to.almostEqual('40000');

                await token.connect(recipient).removePod(farm.address);

                await farm.startFarming('72000', time.duration.weeks(1));
                await time.increaseTo(started + time.duration.weeks(3));

                // expect(await token.farmedPerToken()).to.almostEqual('38000'); // 18k + 8k + 12k
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('38000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('78000');
                expect(await farm.farmed(anotherAccount.address)).to.almostEqual('100000');
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
                |4. |`wallet2` removePods `farm`                     |26k|78k|40k|
                |5. |Fast-forward => **week 3**                 |38k|78k|100k|

            */
            it('Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event', async function () {
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------------------------+ = 18k for 1w +  8k for 2w + 12k for 3w
                // 3x: +----------------+          = 54k for 1w + 24k for 2w +  0k for 3w
                // 5x:         +-----------------+ =  0k for 1w + 40k for 2w + 60k for 3w
                //
                const recipientAmount = INITIAL_SUPPLY / 3n;
                await token.transfer(recipient.address, recipientAmount);
                const anotherAccountAmount = INITIAL_SUPPLY * 5n / 9n;
                await token.transfer(anotherAccount.address, anotherAccountAmount);

                // 72000 UDSC per week for 3 weeks
                const started = await startFarming(farm, '216000', time.duration.weeks(3), initialHolder);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                await token.connect(anotherAccount).addPod(farm.address);

                // expect(await token.farmedPerToken()).to.almostEqual('18000');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('18000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('54000');

                await time.increaseTo(started + time.duration.weeks(2));

                await token.connect(recipient).removePod(farm.address);

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('26000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('78000');
                expect(await farm.farmed(anotherAccount.address)).to.almostEqual('40000');

                await time.increaseTo(started + time.duration.weeks(3));

                // expect(await token.farmedPerToken()).to.almostEqual('38000'); // 18k + 8k + 12k
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('38000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('78000');
                expect(await farm.farmed(anotherAccount.address)).to.almostEqual('100000');
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
                const { token, farm } = await loadFixture(initContracts);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 4n);

                // 10000 UDSC per week for 1 weeks
                const started = await startFarming(farm, '10000', time.duration.weeks(1), initialHolder);

                // expect(await token.farmedPerToken()).to.equal('0');
                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                // 1000 UDSC per week for 1 weeks
                await farm.startFarming('1000', time.duration.weeks(1));

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1) + 2);

                // expect(await token.farmedPerToken()).to.almostEqual('2750');
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('8250');
                expect(await farm.farmed(recipient.address)).to.almostEqual('2750');
            });

            /*
                ***Test Scenario**
                Checks that a farm can successfully operate with the reward value equal to max allowed value.

                Currently _MAX_REWARD_AMOUNT = 10^42. Need to update test if contract changes this constant.

                ***Initial setup**
                - Mint and approve _MAX_REWARD_AMOUNT to `farm`

                ***Test Steps**
                1. A wallet joins farm.
                2. Start farming with _MAX_REWARD_AMOUNT as a reward for 1 week.
                3. Fast forward time for 1 week.
                4. Check the wallet's reward amount.
                5. Claim the reward.

                ***Expected results**
                1. Join, check reward and claim operations completed succesfully.
                2. Claimed reward equals to _MAX_REWARD_AMOUNT.
            */
            it('Operate farm with max allowed reward', async function () {
                const { token, gift, farm } = await loadFixture(initContracts);
                const _MAX_REWARD_AMOUNT = 10n ** 42n;

                await gift.mint(initialHolder.address, _MAX_REWARD_AMOUNT);
                await gift.approve(farm.address, _MAX_REWARD_AMOUNT);

                await token.addPod(farm.address);
                const started = await startFarming(farm, _MAX_REWARD_AMOUNT, time.duration.weeks(1), initialHolder);
                await time.increaseTo(started + time.duration.weeks(1));
                expect(await farm.farmed(initialHolder.address)).to.almostEqual(_MAX_REWARD_AMOUNT);

                const balanceBeforeClaim = await gift.balanceOf(initialHolder.address);
                await farm.claim();
                expect(await gift.balanceOf(initialHolder.address)).to.almostEqual(balanceBeforeClaim.add(_MAX_REWARD_AMOUNT));
            });

            /*
                ***Test Scenario**
                Checks that a farm not credited rewards after farming time expires.

                Currently _MAX_REWARD_AMOUNT = 10^42. Need to update test if contract changes this constant.

                ***Initial setup**
                - Mint and approve _MAX_REWARD_AMOUNT to `farm`

                ***Test Steps**
                1. Start farming with _MAX_REWARD_AMOUNT as a reward for 1 week.
                2. A wallet joins farm.
                3. Fast forward time for 1 week.
                4. Check the wallet's reward amount doesn't increase after this time.

                ***Expected results**
                1. Reward increase stops after 1 week from start farming.
            */
            it('Farm operation time', async function () {
                const { token, gift, farm } = await loadFixture(initContracts);
                const _MAX_REWARD_AMOUNT = 10n ** 42n;

                await gift.mint(initialHolder.address, _MAX_REWARD_AMOUNT);
                await gift.approve(farm.address, _MAX_REWARD_AMOUNT);

                const started = await startFarming(farm, _MAX_REWARD_AMOUNT, time.duration.weeks(1), initialHolder);
                await token.addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));
                const farmedAmount = await farm.farmed(initialHolder.address);
                for (let i = 1; i < 5; i++) {
                    await time.increaseTo(started + time.duration.weeks(1) + i);
                    expect(await farm.farmed(initialHolder.address)).to.equal(farmedAmount);
                }
            });
        });

        // Token transfer scenarios
        describe('transfers', function () {
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
                const { token, farm } = await loadFixture(initContracts);
                //
                // 2x: +-------+ 1х+--------+   = 9k  for 1w + 27k for 2w = 36
                // 1x: +-------+ 2x+--------+   = 27k for 1w +  9k for 2w = 36
                //
                await token.transfer(recipient.address, INITIAL_SUPPLY / 4n);

                // 36000 UDSC per week for 2 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(2), initialHolder);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('27000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('9000');

                await token.transfer(recipient.address, INITIAL_SUPPLY / 2n);

                await time.increaseTo(started + time.duration.weeks(2));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('36000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('36000');
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
                const { token, farm } = await loadFixture(initContracts);
                //
                // 1x: +-------+--------+   = 18k for 1w + 36k for 2w
                // 1x: +-------+            = 18k for 1w +  0k for 2w
                //
                await token.transfer(recipient.address, INITIAL_SUPPLY / 2n);

                // 36000 UDSC per week for 2 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(2), initialHolder);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('18000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('18000');

                await token.connect(recipient).transfer(anotherAccount.address, INITIAL_SUPPLY / 2n);

                await time.increaseTo(started + time.duration.weeks(2));

                // expect(await token.farmedPerToken()).to.almostEqual('38000'); // 18k + 8k + 12k
                expect(await farm.farmed(initialHolder.address)).to.almostEqual('54000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('18000');
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
                const { token, farm } = await loadFixture(initContracts);
                await token.transfer(recipient.address, INITIAL_SUPPLY / 4n);
                await token.transfer(anotherAccount.address, INITIAL_SUPPLY / 2n);

                // 36000 UDSC per week for 2 weeks
                const started = await startFarming(farm, '72000', time.duration.weeks(2), initialHolder);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                await time.increaseTo(started + time.duration.weeks(1));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('18000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('18000');

                await token.connect(anotherAccount).transfer(initialHolder.address, INITIAL_SUPPLY / 2n);

                await time.increaseTo(started + time.duration.weeks(2));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('45000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('27000');
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
                const { token, farm } = await loadFixture(initContracts);
                const started = await startFarming(farm, '72000', time.duration.weeks(2), initialHolder);

                await time.increaseTo(started + time.duration.weeks(1));

                await token.transfer(recipient.address, INITIAL_SUPPLY / 4n);

                await token.addPod(farm.address);
                await token.connect(recipient).addPod(farm.address);

                expect(await farm.farmed(initialHolder.address)).to.equal('0');
                expect(await farm.farmed(recipient.address)).to.equal('0');

                await time.increaseTo(started + time.duration.weeks(2));

                expect(await farm.farmed(initialHolder.address)).to.almostEqual('27000');
                expect(await farm.farmed(recipient.address)).to.almostEqual('9000');
            });
        });
    });
};

module.exports = {
    shouldBehaveLikeFarmable,
};
