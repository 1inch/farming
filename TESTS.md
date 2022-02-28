* [test/ERC20Farmable.js](#testerc20farmable.js)
    * [ERC20Farmable](#erc20farmable)
        * [farming](#farming)
            * [startFarming](#startfarming)
                * [should thrown with rewards distribution access denied ](#should-thrown-with-rewards-distribution-access-denied)
                * [Thrown with Period too large](#thrown-with-period-too-large)
                * [Thrown with Amount too large](#thrown-with-amount-too-large)
            * [claim](#claim)
                * [should claim tokens](#should-claim-tokens)
                * [should claim tokens for non-user farms wallet](#should-claim-tokens-for-non-user-farms-wallet)
            * [claimFor](#claimfor)
                * [should thrown with access denied](#should-thrown-with-access-denied)
* [test/behaviors/ERC20Farmable.behavior.js](#testbehaviorserc20farmable.behavior.js)
    * [should behave like farmable](#should-behave-like-farmable)
        * [farm](#farm)
            * [should update totalSupply](#should-update-totalsupply)
            * [should make totalSupply to decrease with balance](#should-make-totalsupply-to-decrease-with-balance)
            * [should make totalSupply to increase with balance](#should-make-totalsupply-to-increase-with-balance)
            * [should make totalSupply ignore internal transfers](#should-make-totalsupply-ignore-internal-transfers)
            * [should be thrown](#should-be-thrown)
        * [userFarms](#userfarms)
            * [should return user farms](#should-return-user-farms)
        * [exit](#exit)
            * [should be burn](#should-be-burn)
            * [should be thrown](#should-be-thrown)
            * [should not quit twice](#should-not-quit-twice)
        * [deposit](#deposit)
            * [Staker w/o tokens joins on 1st week and adds token on 2nd](#staker-wo-tokens-joins-on-1st-week-and-adds-token-on-2nd)
            * [Two stakers with the same stakes wait 1 w](#two-stakers-with-the-same-stakes-wait-1-w)
            * [Two stakers with the different (1:3) stakes wait 1 w](#two-stakers-with-the-different-13-stakes-wait-1-w)
            * [Two stakers with the different (1:3) stakes wait 2 weeks](#two-stakers-with-the-different-13-stakes-wait-2-weeks)
            * [One staker on 1st and 3rd weeks farming with gap](#one-staker-on-1st-and-3rd-weeks-farming-with-gap)
            * [One staker on 1st and 3rd weeks farming with gap + claim in the middle](#one-staker-on-1st-and-3rd-weeks-farming-with-gap-claim-in-the-middle)
            * [One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle](#one-staker-on-1st-and-3rd-weeks-farming-with-gap-exitfarm-in-the-middle)
            * [One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle](#one-staker-on-1st-and-3rd-weeks-farming-with-gap-exitclaim-in-the-middle)
            * [Three stakers with the different (1:3:5) stakes wait 3 weeks](#three-stakers-with-the-different-135-stakes-wait-3-weeks)
            * [Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event](#three-stakers-with-the-different-135-stakes-wait-3-weeks-for-1-farming-event)
            * [Notify Reward Amount before prev farming finished](#notify-reward-amount-before-prev-farming-finished)
        * [transfers](#transfers)
            * [Transfer from one wallet to another, both farming](#transfer-from-one-wallet-to-another-both-farming)
            * [Transfer from one wallet to another, sender is farming, reciever is not farming](#transfer-from-one-wallet-to-another-sender-is-farming-reciever-is-not-farming)
            * [Transfer from one wallet to another, sender is not farming, reciever is farming](#transfer-from-one-wallet-to-another-sender-is-not-farming-reciever-is-farming)
            * [Transfer from one wallet to another, both are not farming](#transfer-from-one-wallet-to-another-both-are-not-farming)
* [test/FarmingPool.js](#testfarmingpool.js)
    * [startFarming](#startfarming)
        * [should thrown with rewards distribution access denied ](#should-thrown-with-rewards-distribution-access-denied)
    * [name](#name)
        * [should be return name](#should-be-return-name)
    * [symbol](#symbol)
        * [should be return symbol](#should-be-return-symbol)
    * [decimals](#decimals)
        * [should be return decimals](#should-be-return-decimals)
    * [mint](#mint)
        * [should be mint](#should-be-mint)
    * [burn](#burn)
        * [should be burn](#should-be-burn)
        * [should be thrown](#should-be-thrown)
    * [deposit](#deposit)
        * [Two stakers with the same stakes wait 1 w](#two-stakers-with-the-same-stakes-wait-1-w)
        * [Two stakers with the different (1:3) stakes wait 1 w](#two-stakers-with-the-different-13-stakes-wait-1-w)
        * [Two stakers with the different (1:3) stakes wait 2 weeks](#two-stakers-with-the-different-13-stakes-wait-2-weeks)
        * [One staker on 1st and 3rd weeks farming with gap](#one-staker-on-1st-and-3rd-weeks-farming-with-gap)
        * [One staker on 1st and 3rd weeks farming with gap + claim in the middle](#one-staker-on-1st-and-3rd-weeks-farming-with-gap-claim-in-the-middle)
        * [Three stakers with the different (1:3:5) stakes wait 3 weeks + 1 second](#three-stakers-with-the-different-135-stakes-wait-3-weeks-1-second)
        * [Three stakers with the different (1:3:5) stakes wait 3 weeks](#three-stakers-with-the-different-135-stakes-wait-3-weeks)
        * [One staker on 2 durations with gap](#one-staker-on-2-durations-with-gap)
        * [Notify Reward Amount from mocked distribution to 10,000](#notify-reward-amount-from-mocked-distribution-to-10000)
        * [Thrown with Period too large](#thrown-with-period-too-large)
        * [Thrown with Amount too large](#thrown-with-amount-too-large)
        * [Notify Reward Amount before prev farming finished](#notify-reward-amount-before-prev-farming-finished)
    * [transfer](#transfer)
        * [should be correct farming after transfered from non-farm user to farm user](#should-be-correct-farming-after-transfered-from-non-farm-user-to-farm-user)
        * [should be correct farming after transfered from farm user to non-farm user](#should-be-correct-farming-after-transfered-from-farm-user-to-non-farm-user)
        * [should be correct farming after transfered from non-farm user to non-farm user](#should-be-correct-farming-after-transfered-from-non-farm-user-to-non-farm-user)
        * [should be correct farming after transfered from farm user to farm user](#should-be-correct-farming-after-transfered-from-farm-user-to-farm-user)
# ERC20Farmable

## farming

Generic farming scenarios

### startFarming

Farm initialization scenarios

#### should thrown with rewards distribution access denied 


**Test Scenario**
Checks that only distributor may launch farming. "Distributor" is the only account that offers farming reward.
**Initial setup**
- `wallet1` - distributor account
- `wallet2` - non-distributor account

**Test Steps**
Start farming using `wallet2`
**Expected results**
Revert with error `'F: access denied'`.




#### Thrown with Period too large


**Test Scenario**
Check that farming period is of `uint40` size.

**Test Steps**
Start farming using 2^40^ as farming period.

**Expected results**
Revert with error `'FA: period too large'`.




#### Thrown with Amount too large


**Test Scenario**
Check that farming amount is under `uint192`

**Test Steps**
Start farming using 2^192^ as farming reward.

**Expected results**
Revert with error `'FA: amount too large'`.




### claim

Token's claim scenarios

#### should claim tokens


**Test Scenario**
Checks that farming reward can be claimed with the regular scenario 'join - farm - claim'.
**Initial setup**
- `farm` started farming for 1 day with 1000 units reward
- `wallet1` has 1000 unit of farmable token and joined the farm

**Test Steps**
1. Fast-forward time to 1 day and 1 hour
2. Claim reward for `wallet1`

**Expected results**
`wallet1` reward token balance equals 1000




#### should claim tokens for non-user farms wallet


**Test Scenario**
Checks that non-farming wallet doesn't get a reward
**Initial setup**
- `farm` started farming for 1 day with 1000 units reward
- `wallet1` has 1000 unit of farmable token and joined the farm
- `wallet2` hasn't joined the farm

**Test Steps**
1. Fast-forward time to 1 day and 1 hour
2. Claim reward for `wallet2`

**Expected results**
`wallet2` gift token balance doesn't change after claim




### claimFor

Farm's claim scenarios

#### should thrown with access denied


**Test Scenario**
Ensure that `claimFor` can be called only by farmable token contract
**Initial setup**
- `wallet1` has 1000 unit of farmable token and joined the farm
- `wallet2` has 1000 unit of farmable token and joined the farm

**Test Steps**
Call farm's `claimFor` for `wallet1`

**Expected results**
Revert with error `'ERC20: access denied'`



# should behave like farmable

Behavior test scenarios

## farm

Wallet joining scenarios

### should update totalSupply


**Test Scenario**
Checks if farm's total supply is updated after a wallet joins

**Initial setup**
- `wallet1` has 1000 unit of farmable token but has not joined the farm

**Test Steps**
`wallet1` joins the farm

**Expected results**
Farm's total supply equals 1000




### should make totalSupply to decrease with balance


**Test Scenario**
Checks if farm's total supply is decreased after a wallet balance decreased
**Initial setup**
- `wallet1` has 1000 unit of farmable token and joined the farm
- `wallet2` has no farmable token and hasn't joined the farm

**Test Steps**
Transfer 600 units from `wallet1` to `wallet2`
**Expected results**
Farm's total supply decreased and equals to 400




### should make totalSupply to increase with balance


**Test Scenario**
Checks if farm's total supply is increased after a wallet balance increased
**Initial setup**
- `wallet1` has 1000 unit of farmable token and joined the farm
- `wallet2` has 1000 unit of farmable token and hasn't joined the farm

**Test Steps**
Transfer 500 units from `wallet2` to `wallet1`
**Expected results**
Farm's total supply increased and equals to 1500




### should make totalSupply ignore internal transfers


**Test Scenario**
Checks if farm's total supply is unchaged after a transfer between farming wallets
**Initial setup**
- `wallet1` has 1000 unit of farmable token and joined the farm
- `wallet2` has 1000 unit of farmable token and joined the farm

**Test Steps**
Transfer 500 units from `wallet1` to `wallet2`
**Expected results**
Farm's total supply remains unchanged and equals to 400




### should be thrown


**Test Scenario**
Ensure that wallet can't join the same farm twice
**Initial setup**
- `wallet1` has 1000 unit of farmable token and has joined the farm

**Test Steps**
Join `wallet1` to the farm
**Expected results**
Reverts with error `'ERC20Farmable: already farming'`




## userFarms

Check all farms a user is farming scenarios

### should return user farms


**Test Scenario**
Check farms list a user farming is returned correctly for the wallet

**Initial setup**
`wallet1` has 1000 unit of farmable token and joined the only farm

**Test Steps**
Get all farms for `wallet1`

**Expected results**
- Number of farms returned is 1
- Address of the farm is the farm's address `wallet1` joined during setup




## exit

Tokens farming exit scenarios

### should be burn


**Test Scenario**
Checks that farm's total supply decreases after a user quits farming

**Initial setup**
- `farm` has not started farming
- `wallet1` has 1000 unit of farmable token and joined the `farm`

**Test Steps**
`wallet1` quits the `farm`

**Expected results**
Farm's total supply equals 0




### should be thrown


**Test Scenario**
Check that wallet can't quit a farm that it doesn't participate

**Initial setup**
`wallet1` has not joined any farm

**Test Steps**
Quit `wallet1` from the `farm`

**Expected results**
Reverts with error `'ERC20Farmable: already exited'`




### should not quit twice


**Test Scenario**
Check that wallet can't quit a farm twice in a row

**Initial setup**
`wallet1` has joined the `farm`

**Test Steps**
1. Quit `wallet1` from the `farm`
1. Quit `wallet1` from the `farm`

**Expected results**
Reverts with error `'ERC20Farmable: already exited'`




## deposit

Farming reward calculations scenarios

### Staker w/o tokens joins on 1st week and adds token on 2nd


**Test Scenario**
Staker without farming tokens joins on 1st week and adds them on 2nd
```
72k => 1x: +       +-------+ => 36k
```

**Initial setup**
- `farm` has started farming **72k** for **2 weeks**
- `wallet1` has no farmable token and joined the `farm`

**Test Steps**
1. Fast-forward to 1 week end
2. `wallet1` gets farming tokens
3. Fast-forward to 2 week

**Expected results**
After step 1 - farmed reward = 0
After step 3 - farmed reward = 36k




### Two stakers with the same stakes wait 1 w


**Test Scenario**
Two stakers with the same stakes wait 1w
```
72k => 1x: +-------+  => 36k
#      1x: +-------+  => 36k
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 1 farmable token and joined the `farm`

**Test Steps**
Fast-forward to week 1 end

**Expected results**
`wallet1` farmed reward is 36k
`wallet2` farmed reward is 36k




### Two stakers with the different (1:3) stakes wait 1 w


**Test Scenario**
Two stakers with the same stakes wait 1w
```
72k => 1x: +-------+  => 18k
#      3x: +-------+  => 54k
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and joined the `farm`

**Test Steps**
Fast-forward to week 1 end

**Expected results**
`wallet1` farmed reward is 18k
`wallet2` farmed reward is 54k




### Two stakers with the different (1:3) stakes wait 2 weeks


**Test Scenario**
Two stakers with the different (1:3) stakes wait 2 weeks
```
72k => 1x: +--------+ 72k => 1x: +--------+ => 72k for 1w + 18k for 2w
#      0x:                   3x: +--------+ =>  0k for 1w + 54k for 2w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and has not joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |Fast-forward => **week 1**                 |72k|0|
|2. |`wallet2` joins the `farm`                 |72k|0|
|3. |`farm` starts new farming 72k for 1 week   |72k|0|
|4. |Fast-forward => **week 2**                 |90k|54k|





### One staker on 1st and 3rd weeks farming with gap


**Test Scenario**
One staker on 1st and 3rd weeks farming with gap
```
72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|
|---|----------|---------|
|1. |Fast-forward => **week 1**                 |72k|
|2. |Fast-forward => **week 2**                 |72k|
|3. |`farm` starts new farming 72k for 1 week   |72k|
|4. |Fast-forward => **week 3**                 |144k|





### One staker on 1st and 3rd weeks farming with gap + claim in the middle


**Test Scenario**
One staker on 1st and 3rd weeks farming with gap and claims in the middle
```
72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|
|---|----------|---------|
|1. |Fast-forward => **week 1**                 |72k|
|2. |Claim reward for `wallet1`                 |0  |
|2. |Fast-forward => **week 2**                 |0|
|3. |`farm` starts new farming 72k for 1 week   |0|
|4. |Fast-forward => **week 3**                 |72k|





### One staker on 1st and 3rd weeks farming with gap + exit/farm in the middle


**Test Scenario**
One staker on 1st and 3rd weeks farming with gap and exits and rejoins in the middle
```
72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|
|---|----------|---------|
|1. |Fast-forward => **week 1**                 |72k|
|2. |`wallet1` quits `farm`                     |72k|
|3. |`wallet1` joins `farm`                     |72k|
|4. |Fast-forward => **week 2**                 |72k|
|5. |`farm` starts new farming 72k for 1 week   |72k|
|6. |Fast-forward => **week 3**                 |144k|





### One staker on 1st and 3rd weeks farming with gap + exit/claim in the middle


**Test Scenario**
One staker on 1st and 3rd weeks farming with gap and exits, claims and rejoins in the middle
```
72k => 1x: +--------+       72k => 1x: +--------+ = 72k for 1w + 0k for 2w + 72k for 3w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|
|---|----------|---------|
|1. |Fast-forward => **week 1**                 |72k|
|2. |`wallet1` quits `farm`                     |72k|
|3. |`wallet1` claims farming reward            |0k|
|4. |`wallet1` joins `farm`                     |0k|
|5. |Fast-forward => **week 2**                 |0k|
|6. |`farm` starts new farming 72k for 1 week   |72k|
|7. |Fast-forward => **week 3**                 |72k|





### Three stakers with the different (1:3:5) stakes wait 3 weeks


**Test Scenario**
Three stakers with the different (1:3:5) stakes wait 3 weeks
```
1x: 72k =>  +-------+ 72k => +-------+ 72k => +-------+ = 18k for 1w +  8k for 2w + 12k for 3w
3x:         +-------+        +-------+                  = 54k for 1w + 24k for 2w +  0k for 3w
5x:                          +-------+        +-------+ =  0k for 1w + 40k for 2w + 60k for 3w
```

**Initial setup**
- `farm` has started farming **72k** for **1 week**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and joined the `farm`
- `wallet3` has 5 farmable token and hasn't joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|`wallet3`|
|---|----------|---------|---------|---------|
|1. |Fast-forward => **week 1**                 |18k|54k|0|
|2. |`wallet3` joins `farm`                     |18k|54k|0|
|3. |`farm` starts new farming 72k for 1 week   |18k|54k|0|
|4. |Fast-forward => **week 2**                 |26k|78k|40k|
|5. |`wallet2` quits `farm`                     |26k|78k|40k|
|6. |`farm` starts new farming 72k for 1 week   |26k|78k|40k|
|7. |Fast-forward => **week 3**                 |38k|78k|100k|





### Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event


**Test Scenario**
Three stakers with the different (1:3:5) stakes wait 3 weeks for 1 farming event
```
1x: 216k => +---------------------+ = 18k for 1w +  8k for 2w + 12k for 3w
3x:         +--------------+        = 54k for 1w + 24k for 2w +  0k for 3w
5x:                +--------------+ =  0k for 1w + 40k for 2w + 60k for 3w
```

**Initial setup**
- `farm` has started farming **216k** for **3 weeks**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and joined the `farm`
- `wallet3` has 5 farmable token and hasn't joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|`wallet3`|
|---|----------|---------|---------|---------|
|1. |Fast-forward => **week 1**                 |18k|54k|0|
|2. |`wallet3` joins `farm`                     |18k|54k|0|
|3. |Fast-forward => **week 2**                 |26k|78k|40k|
|4. |`wallet2` quits `farm`                     |26k|78k|40k|
|5. |Fast-forward => **week 3**                 |38k|78k|100k|





### Notify Reward Amount before prev farming finished


**Test Scenario**
Add more farming reward before previous farming finished
```
1x: 10k => +-------+ = 2750 for 1w
3x:  1k => +-------+ = 8250 for 1w
```

**Initial setup**
- `farm` has started farming **10k** for **1 weeks**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |`farm` starts new farming 1k for 1 week    |0|0|
|2. |Fast-forward => **week 1**                 |2720|8250|





## transfers

Token transfer scenarios

### Transfer from one wallet to another, both farming


**Test Scenario**
Transfer from one wallet to another, both are farming
```
72k => 2x: +-------+ 1х: +--------+   = 9k  for 1w + 27k for 2w = 36
#      1x: +-------+ 2x: +--------+   = 27k for 1w +  9k for 2w = 36
```

**Initial setup**
- `farm` has started farming **72k** for **2 weeks**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 3 farmable token and joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |Fast-forward => **week 1**                             |9k|27k|
|2. |Transfer 2 farmable tokens from `wallet2` to `wallet1` |9k|27k|
|3. |Fast-forward => **week 2**                             |36k|36k|





### Transfer from one wallet to another, sender is farming, reciever is not farming

```

1x: +-------+--------+   = 18k for 1w + 36k for 2w

1x: +-------+            = 18k for 1w +  0k for 2w

```


**Test Scenario**
Transfer from one wallet to another, sender is farming, reciever is not farming
```
72k => 1x: +-------+ 1х: +--------+   = 9k  for 1w + 27k for 2w = 36
#      1x: +-------+ 0x: +        +   = 27k for 1w +  9k for 2w = 36
```

**Initial setup**
- `farm` has started farming **72k** for **2 weeks**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 1 farmable token and joined the `farm`
- `wallet3` has no farmable token and hasn't joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |Fast-forward => **week 1**                             |18k|18k|
|2. |Transfer 2 farmable tokens from `wallet2` to `wallet3` |18k|18k|
|3. |Fast-forward => **week 2**                             |54k|18k|





### Transfer from one wallet to another, sender is not farming, reciever is farming


**Test Scenario**
Transfer farming token to farming wallet in the middle of farming
```
72k => 1x: +-------+ 3х: +--------+   = 18k  for 1w + 27k for 2w = 36
#      1x: +-------+ 1x: +--------+   = 18k for 1w +  9k for 2w = 36
```

**Initial setup**
- `farm` has started farming **72k** for **2 weeks**
- `wallet1` has 1 farmable token and joined the `farm`
- `wallet2` has 1 farmable token and joined the `farm`
- `wallet3` has 2 farmable token and hasn't joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |Fast-forward => **week 1**                             |18k|18k|
|2. |Transfer 2 farmable tokens from `wallet3` to `wallet1` |18k|18k|
|3. |Fast-forward => **week 2**                             |45k|27k|





### Transfer from one wallet to another, both are not farming


**Test Scenario**
Transfer from one wallet to another, both are not farming
```
72k => 0x: +       + 1х: +--------+   = 0k for 1w +  9k for 2w
#      0x: +       + 3x: +--------+   = 0k for 1w + 27k for 2w
```

**Initial setup**
- `farm` has started farming **72k** for **2 weeks**
- `wallet1` has 1 farmable token and has not joined the `farm`
- `wallet2` has 1 farmable token and has not joined the `farm`

**Test steps and expected rewards**
|#  |Test Steps|`wallet1`|`wallet2`|
|---|----------|---------|---------|
|1. |Fast-forward => **week 1**                             |0|0|
|3. |Transfer 3 from `wallet1` to `wallet2`                 |0|0|
|2. |`wallet1` and `wallet2` join the `farm`                |0|0|
|4. |Fast-forward => **week 2**                             |27k|9k|




# startFarming

## should thrown with rewards distribution access denied 



# name

## should be return name



# symbol

## should be return symbol



# decimals

## should be return decimals



# mint

## should be mint



# burn

## should be burn



## should be thrown



# deposit

## Two stakers with the same stakes wait 1 w



## Two stakers with the different (1:3) stakes wait 1 w



## Two stakers with the different (1:3) stakes wait 2 weeks



## One staker on 1st and 3rd weeks farming with gap



## One staker on 1st and 3rd weeks farming with gap + claim in the middle



## Three stakers with the different (1:3:5) stakes wait 3 weeks + 1 second



## Three stakers with the different (1:3:5) stakes wait 3 weeks



## One staker on 2 durations with gap



## Notify Reward Amount from mocked distribution to 10,000



## Thrown with Period too large



## Thrown with Amount too large



## Notify Reward Amount before prev farming finished



# transfer

## should be correct farming after transfered from non-farm user to farm user



## should be correct farming after transfered from farm user to non-farm user



## should be correct farming after transfered from non-farm user to non-farm user



## should be correct farming after transfered from farm user to farm user


