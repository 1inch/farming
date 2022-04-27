const { constants, expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { toBN } = require('@1inch/solidity-utils');
const { expect } = require('chai');
const { timeIncreaseTo, almostEqual, startFarming, joinNewFarms } = require('./utils');
const { shouldBehaveLikeFarmable } = require('./behaviors/ERC20Farmable.behavior.js');

const ERC20FarmableMock = artifacts.require('ERC20FarmableMock');
const Farm = artifacts.require('Farm');
const TokenMock = artifacts.require('TokenMock');
const EthTransferMock = artifacts.require('EthTransferMock');

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
        });

        // Farm initialization scenarios
        describe('startFarming', async () => {
            /*
                ***Test Scenario**
                Checks that only distributors may launch farming. "Distributor" is the only account that offers a farming reward.
                ***Initial setup**
                - `wallet1` - distributor account
                - `wallet2` - non-distributor account

                ***Test Steps**
                Start farming using `wallet2`
                ***Expected results**
                Revert with error `'AccessDenied()'`.
            */
            it('should thrown with rewards distribution access denied ', async () => {
                await expectRevert(
                    this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
                    'AccessDenied()',
                );
            });

            /*
                ***Test Scenario**
                Checks that the farming period is of `uint40` size.

                ***Test Steps**
                Start farming using 2^40^ as the farming period.

                ***Expected results**
                Revert with error `'DurationTooLarge()'`.
            */
            it('Thrown with Period too large', async () => {
                await expectRevert(
                    this.farm.startFarming('10000', (toBN(2)).pow(toBN(40)), { from: wallet1 }),
                    'DurationTooLarge()',
                );
            });

            /*
                ***Test Scenario**
                Checks that the farming amount is under _MAX_REWARD_AMOUNT

                ***Test Steps**
                Start farming using _MAX_REWARD_AMOUNT+1 as a farming reward.

                ***Expected results**
                Revert with error `'AmountTooLarge()'`.
            */
            it('Thrown with Amount equals _MAX_REWARD_AMOUNT + 1', async () => {
                const _MAX_REWARD_AMOUNT = toBN(10).pow(toBN(42));
                await this.gift.mint(wallet1, _MAX_REWARD_AMOUNT.addn(1));
                await this.gift.approve(this.farm.address, _MAX_REWARD_AMOUNT.addn(1));
                await expectRevert(
                    this.farm.startFarming(_MAX_REWARD_AMOUNT.addn(1), time.duration.weeks(1), { from: wallet1 }),
                    'AmountTooLarge()',
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
                - `wallet1` has 1000 farmable tokens and has joined the farm

                ***Test Steps**
                1. Fast-forward time to 1 day and 1 hour
                2. Claim reward for `wallet1`

                ***Expected results**
                `wallet1` reward token balance equals 1000
            */
            it('should claim tokens', async () => {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                const started = await startFarming(this.farm, 1000, 60 * 60 * 24, wallet1);
                await timeIncreaseTo(started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet1);
                await this.token.claim(this.farm.address, { from: wallet1 });
                expect(await this.gift.balanceOf(wallet1)).to.be.bignumber.equal(balanceBefore.addn(1000));
            });

            /*
                ***Test Scenario**
                Checks that non-farming wallet doesn't get a reward
                ***Initial setup**
                - `farm` started farming for 1 day with 1000 units reward
                - `wallet1` has 1000 farmable tokens and joined the farm
                - `wallet2` hasn't joined the farm

                ***Test Steps**
                1. Fast-forward time to 1 day and 1 hour
                2. Claim reward for `wallet2`

                ***Expected results**
                `wallet2` gift token balance doesn't change after the claim
            */
            it('should claim tokens for non-user farms wallet', async () => {
                await this.token.join(this.farm.address, { from: wallet1 });
                await this.gift.transfer(this.farm.address, '1000', { from: wallet2 });

                const started = await startFarming(this.farm, 1000, 60 * 60 * 24, wallet1);
                await timeIncreaseTo(started.addn(60 * 60 * 25));

                const balanceBefore = await this.gift.balanceOf(wallet2);
                await this.token.claim(this.farm.address, { from: wallet2 });
                expect(await this.gift.balanceOf(wallet2)).to.be.bignumber.equal(balanceBefore);
            });
        });

        // Farm's claimFor scenarios
        describe('claimFor', async () => {
            /*
                ***Test Scenario**
                Ensures that `claimFor` can be called only by farmable token contract
                ***Initial setup**
                - `wallet1` has 1000 farmable tokens and joined the farm
                - `wallet2` has 1000 farmable tokens and joined the farm

                ***Test Steps**
                Call farm's `claimFor` for `wallet1`

                ***Expected results**
                Revert with error `'AccessDenied()'`
            */
            it('should thrown with access denied', async () => {
                await expectRevert(
                    this.farm.claimFor(wallet1, '1000', { from: wallet1 }),
                    'AccessDenied()',
                );
            });
        });

        // Farm's claimAll scenarios
        describe('claimAll', async () => {
            /*
                ***Test Scenario**
                Checks that farming rewards can be claimed from all user's farms with the regular scenario 'join - farm - claim'.

                ***Initial setup**
                - 10 farms have been created and set up
                - All `farms` have started farming for 1 day with 100 units reward for each
                - `wallet1` has 1000 farmable tokens and has joined 10 farms
                - `wallet1` has no reward tokens

                ***Test Steps**
                1. Fast-forward time to finish all farmings (1 day)
                2. `wallet1` claims rewards from all farms using the `claimAll` function

                ***Expected results**
                `wallet1` reward token balance equals 1000
            */
            it('should claim tokens from all farm', async () => {
                // Create and set additional farms
                const amountFarms = 10;
                const farms = [];
                let lastFarmStarted;
                for (let i = 0; i < amountFarms; i++) {
                    farms[i] = await Farm.new(this.token.address, this.gift.address);
                    await farms[i].setDistributor(wallet1);
                    await this.gift.transfer(farms[i].address, '100', { from: wallet2 });
                }

                // Join and start farming, then delay
                for (let i = 0; i < amountFarms; i++) {
                    await this.token.join(farms[i].address);
                    await this.gift.approve(farms[i].address, '100');
                    lastFarmStarted = await startFarming(farms[i], 100, time.duration.days(1), wallet1);
                }
                await timeIncreaseTo(lastFarmStarted.add(time.duration.days(1)));

                // Check reward
                const balanceBefore = await this.gift.balanceOf(wallet1);
                await this.token.claimAll({ from: wallet1 });
                expect(await this.gift.balanceOf(wallet1)).to.be.bignumber.equal(balanceBefore.addn(1000));
            });
        });

        // Farm's rescueFunds scenarios
        describe('rescueFunds', async () => {
            /*
                ***Test Scenario**
                Ensures that a non-distributor account cannot call the `rescueFunds` function to get all remaining funds from the farm.

                ***Initial setup**
                - `wallet2` is not a distributor

                ***Test Steps**
                - `wallet2` calls `rescueFunds` function

                ***Expected results**
                - Call is reverted with an error `'AccessDenied()'`
            */
            it('should thrown with access denied', async () => {
                const distributor = await this.farm.distributor();
                expect(wallet2).to.be.not.equals(distributor);
                await expectRevert(
                    this.farm.rescueFunds(this.gift.address, '1000', { from: wallet2 }),
                    'AccessDenied()',
                );
            });

            /*
                ***Test Scenario**
                Ensures that a distributor account can get remaining funds from the farm using the `rescueFunds` function.

                ***Initial setup**
                - A farm has started farming

                ***Test Steps**
                - Distributor calls the `rescueFunds` function to transfer 1000 reward tokens from the farm to its account
                - Check the balances of the distributor's account and the farm's accounts

                ***Expected results**
                - 1000 reward tokens are transferred from the farm to the distributor
            */
            it('should transfer tokens from farm to wallet', async () => {
                await this.farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });

                const balanceWalletBefore = await this.gift.balanceOf(wallet1);
                const balanceFarmBefore = await this.gift.balanceOf(this.farm.address);

                const distributor = await this.farm.distributor();
                expect(wallet1).to.be.equals(distributor);
                await this.farm.rescueFunds(this.gift.address, '1000', { from: wallet1 });

                expect(await this.gift.balanceOf(wallet1)).to.be.bignumber.equals(balanceWalletBefore.addn(1000));
                expect(await this.gift.balanceOf(this.farm.address)).to.be.bignumber.equals(balanceFarmBefore.subn(1000));
            });

            /*
                ***Test Scenario**
                Ensure that `rescueFunds` can transfer ether to a distributor

                ***Initial setup**
                - A farm has been set up and ether has been transferred to the farm

                ***Test Steps**
                - Call `rescueFunds` function to get 1000 ethers
                - Calculate rescueFunds blockchain fee

                ***Expected results**
                - `wallet1` balance has increased by 1000 ethers minus the blockchain fee
            */
            it('should transfer ethers from farm to wallet', async () => {
                // Transfer ethers to farm
                await EthTransferMock.new(this.farm.address, { from: wallet1, value: '1000' });

                // Check rescueFunds
                const balanceWalletBefore = toBN(await web3.eth.getBalance(wallet1));
                const balanceFarmBefore = toBN(await web3.eth.getBalance(this.farm.address));

                const distributor = await this.farm.distributor();
                expect(wallet1).to.be.equals(distributor);
                const tx = await this.farm.rescueFunds(constants.ZERO_ADDRESS, '1000', { from: wallet1 });
                const txCost = toBN(tx.receipt.gasUsed).mul(toBN(tx.receipt.effectiveGasPrice));

                expect(toBN(await web3.eth.getBalance(wallet1))).to.be.bignumber.equals(balanceWalletBefore.sub(txCost).addn(1000));
                expect(toBN(await web3.eth.getBalance(this.farm.address))).to.be.bignumber.equals(balanceFarmBefore.subn(1000));
            });
        });

        // Farm's userFarms scenarios
        describe('userIsFarming', async () => {
            /*
                ***Test Scenario**
                Ensures that the `userIsFarming` view returns the correct farming status

                ***Initial setup**
                - `wallet1` has not joined a farm
                - `wallet2` has joined a farm

                ***Test Steps**
                - Check if `wallet1` and `wallet2` are farming

                ***Expected results**
                - `wallet1` status: is not farming (false)
                - `wallet2` status: is farming (true)
            */
            it('should return false when user does not farm and true when user farms', async () => {
                await this.token.join(this.farm.address, { from: wallet2 });
                expect(await this.token.userIsFarming(wallet1, this.farm.address)).to.be.equals(false);
                expect(await this.token.userIsFarming(wallet2, this.farm.address)).to.be.equals(true);
            });

            /*
                ***Test Scenario**
                Ensures that `userIsFarming` returns the correct farming status after `quit` is called

                ***Test Steps**
                - `wallet2` joins to farm
                - `wallet2` quits from farm

                ***Expected results**
                - `wallet2` status: is not farming (false)
            */
            it('should return false when user quits from farm', async () => {
                await this.token.join(this.farm.address, { from: wallet2 });
                await this.token.quit(this.farm.address, { from: wallet2 });
                expect(await this.token.userIsFarming(wallet1, this.farm.address)).to.be.equals(false);
            });
        });

        describe('userFarmsCount', async () => {
            /*
                ***Test Scenario**
                Ensures that the `userFarmsCount` view returns the correct amount of user's farms

                ***Test Steps**
                1. Account joins to N farms
                2. Account quits from N farms

                ***Expected results**
                - Each time the account joins a farm `userFarmsCount` should increase by 1
                - Each time the account quits from a farm `userFarmsCount` should decrease by 1
            */
            it('should return amount of user\'s farms', async () => {
                const amount = toBN(10);
                await joinNewFarms(this.token, amount, wallet1);
                expect(await this.token.userFarmsCount(wallet1)).to.be.bignumber.equals(amount);

                const farms = await this.token.userFarms(wallet1);
                expect(toBN(farms.length)).to.be.bignumber.equals(amount);
                for (let i = 0; i < amount; i++) {
                    await this.token.quit(farms[i]);
                    expect(await this.token.userFarmsCount(wallet1)).to.be.bignumber.equals(amount.subn(1 + i));
                }
            });
        });

        describe('userFarmsAt', async () => {
            /*
                ***Test Scenario**
                Ensure that the `userFarmsAt` view returns the correct farm by index

                ***Initial setup**
                - Account joins an array of farms

                ***Test Steps**
                1. Call `userFarms` view to get an array of joined farms for the account
                2. Request each farm's address with `userFarmsAt` view and compare it with the farm's address in the array

                ***Expected results**
                - Each pair of addresses should be equal
            */
            it('should return correct addresses', async () => {
                const amount = toBN(10);
                await joinNewFarms(this.token, amount, wallet1);
                const farms = await this.token.userFarms(wallet1);
                for (let i = 0; i < amount; i++) {
                    const farmAddress = await this.token.userFarmsAt(wallet1, i);
                    expect(farmAddress).to.be.equals(farms[i]);
                }
            });
        });
    });
});
