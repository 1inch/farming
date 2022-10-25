const { constants, expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { BigNumber: BN } = require('ethers');
const { timeIncreaseTo, almostEqual, startFarming, joinNewFarms } = require('./utils');
const { shouldBehaveLikeFarmable } = require('./behaviors/ERC20Farmable.behavior.js');

require('chai').use(function (chai, utils) {
    chai.Assertion.overwriteMethod('almostEqual', (original) => {
        return function (value) {
            if (utils.flag(this, 'bignumber')) {
                const expected = BN.from(value);
                const actual = BN.from(this._obj);
                almostEqual.apply(this, [expected, actual]);
            } else {
                original.apply(this, arguments);
            }
        };
    });
});

describe('ERC20Farmable', function () {
    let wallet1, wallet2, wallet3;
    let ERC20FarmableMock;
    let Farm;
    let EthTransferMock;
    let TokenMock;
    const INITIAL_SUPPLY = ether('1.0');
    const MAX_USER_FARMS = 10;

    before(async () => {
        [wallet1, wallet2, wallet3] = await ethers.getSigners();
        ERC20FarmableMock = await ethers.getContractFactory('ERC20FarmableMock');
        Farm = await ethers.getContractFactory('Farm');
        TokenMock = await ethers.getContractFactory('TokenMock');
        EthTransferMock = await ethers.getContractFactory('EthTransferMock');
    });

    async function initContracts () {
        const token = await ERC20FarmableMock.deploy('1INCH', '1INCH', MAX_USER_FARMS);
        await token.deployed();
        await token.mint(wallet1.address, INITIAL_SUPPLY);

        gift = await TokenMock.deploy('UDSC', 'USDC');
        await gift.deployed();
        farm = await Farm.deploy(token.address, gift.address);
        await farm.deployed();
    };

    shouldBehaveLikeFarmable(() => ({
        INITIAL_SUPPLY,
        initialHolder: wallet1,
        recipient: wallet2,
        anotherAccount: wallet3,
        token: token,
        farm: farm,
        gift: gift,
    }));

    // Generic farming scenarios
    describe('farming', async () => {
        beforeEach(async () => {
            gift = await TokenMock.deploy('UDSC', 'USDC');
            await gift.deployed();
            farm = await Farm.deploy(token.address, gift.address);
            await farm.deployed();

            for (const wallet of [wallet1, wallet2, wallet3]) {
                await gift.mint(wallet, '1000000000');
                await gift.approve(farm.address, '1000000000', { from: wallet });
            }

            await farm.setDistributor(wallet1.address);
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
                    farm.startFarming(1000, 60 * 60 * 24, { from: wallet2 }),
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
                    farm.startFarming('10000', (BN.from(2)).pow(BN.from(40)), { from: wallet1 }),
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
                const _MAX_REWARD_AMOUNT = BN.from(10).pow(BN.from(42));
                await gift.mint(wallet1.address, _MAX_REWARD_AMOUNT.add(1));
                await gift.approve(farm.address, _MAX_REWARD_AMOUNT.add(1));
                await expectRevert(
                    farm.startFarming(_MAX_REWARD_AMOUNT.add(1), time.duration.weeks(1), { from: wallet1 }),
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
                await token.join(farm.address, { from: wallet1 });
                await gift.transfer(farm.address, '1000', { from: wallet2 });

                const started = await startFarming(farm, 1000, 60 * 60 * 24, wallet1);
                await timeIncreaseTo(started.add(60 * 60 * 25));

                const balanceBefore = await gift.balanceOf(wallet1.address);
                await token.claim(farm.address, { from: wallet1 });
                expect(await gift.balanceOf(wallet1.address)).to.equal(balanceBefore.add(1000));
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
                await token.join(farm.address, { from: wallet1 });
                await gift.transfer(farm.address, '1000', { from: wallet2 });

                const started = await startFarming(farm, 1000, 60 * 60 * 24, wallet1);
                await timeIncreaseTo(started.add(60 * 60 * 25));

                const balanceBefore = await gift.balanceOf(wallet2.address);
                await token.claim(farm.address, { from: wallet2 });
                expect(await gift.balanceOf(wallet2.address)).to.equal(balanceBefore);
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
                    farm.claimFor(wallet1.address, '1000', { from: wallet1 }),
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
            it('should claim tokens from all farms', async () => {
                // Create and set additional farms
                const amountFarms = 10;
                const farms = [];
                let lastFarmStarted;
                for (let i = 0; i < amountFarms; i++) {
                    farms[i] = await Farm.deploy(token.address, gift.address);
                    await farms[i].setDistributor(wallet1.address);
                    await gift.transfer(farms[i].address, '100', { from: wallet2 });
                }

                // Join and start farming, then delay
                for (let i = 0; i < amountFarms; i++) {
                    await token.join(farms[i].address);
                    await gift.approve(farms[i].address, '100');
                    lastFarmStarted = await startFarming(farms[i], 100, time.duration.days(1), wallet1);
                }
                await timeIncreaseTo(lastFarmStarted.add(time.duration.days(1)));

                // Check reward
                const balanceBefore = await gift.balanceOf(wallet1.address);
                await token.claimAll({ from: wallet1 });
                expect(await gift.balanceOf(wallet1.address)).to.equal(balanceBefore.add(1000));
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
                const distributor = await farm.distributor();
                expect(wallet2.address).to.not.equal(distributor.address);
                await expectRevert(
                    farm.rescueFunds(gift.address, '1000', { from: wallet2 }),
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
                await farm.startFarming(1000, 60 * 60 * 24, { from: wallet1 });

                const balanceWalletBefore = await gift.balanceOf(wallet1.address);
                const balanceFarmBefore = await gift.balanceOf(farm.address);

                const distributor = await farm.distributor();
                expect(wallet1.address).to.equal(distributor.address);
                await farm.rescueFunds(gift.address, '1000', { from: wallet1 });

                expect(await gift.balanceOf(wallet1.address)).to.equal(balanceWalletBefore.add(1000));
                expect(await gift.balanceOf(farm.address)).to.equal(balanceFarmBefore.sub(1000));
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
                await EthTransferMock.deploy(farm.address, { from: wallet1, value: '1000' });

                // Check rescueFunds
                const balanceWalletBefore = BN.from(await ethers.provider.getBalance(wallet1.address));
                const balanceFarmBefore = BN.from(await ethers.provider.getBalance(farm.address));

                const distributor = await farm.distributor();
                expect(wallet1.address).to.equal(distributor.address);
                const tx = await farm.rescueFunds(constants.ZERO_ADDRESS, '1000', { from: wallet1 });
                const txCost = BN.from(tx.receipt.gasUsed).mul(BN.from(tx.receipt.effectiveGasPrice));

                expect(BN.from(await ethers.provider.getBalance(wallet1.address))).to.equal(balanceWalletBefore.sub(txCost).add(1000));
                expect(BN.from(await ethers.provider.getBalance(farm.address))).to.equal(balanceFarmBefore.sub(1000));
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
                await token.join(farm.address, { from: wallet2 });
                expect(await token.userIsFarming(wallet1.address, farm.address)).to.equal(false);
                expect(await token.userIsFarming(wallet2.address, farm.address)).to.equal(true);
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
                await token.join(farm.address, { from: wallet2 });
                await token.quit(farm.address, { from: wallet2 });
                expect(await token.userIsFarming(wallet1.address, farm.address)).to.equal(false);
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
                const amount = BN.from(10);
                await joinNewFarms(token, amount, wallet1);
                expect(await token.userFarmsCount(wallet1.address)).to.equal(amount);

                const farms = await token.userFarms(wallet1.address);
                expect(BN.from(farms.length)).to.equal(amount);
                for (let i = 0; i < amount; i++) {
                    await token.quit(farms[i]);
                    expect(await token.userFarmsCount(wallet1.address)).to.equal(amount.sub(1 + i));
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
                const amount = BN.from(10);
                await joinNewFarms(token, amount, wallet1);
                const farms = await token.userFarms(wallet1.address);
                for (let i = 0; i < amount; i++) {
                    const farmAddress = await token.userFarmsAt(wallet1.address, i);
                    expect(farmAddress).to.equal(farms[i]);
                }
            });
        });
    });
});
