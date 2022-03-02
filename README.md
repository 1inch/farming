<div align="center">
    <img src="https://github.com/1inch/farming/blob/master/.github/logo_1inch-light.png#gh-light-mode-only">
    <img src="https://github.com/1inch/farming/blob/master/.github/logo_1inch-dark.png#gh-dark-mode-only">
</div>

# Farming contracts

[![Build Status](https://github.com/1inch/farming/workflows/CI/badge.svg)](https://github.com/1inch/farming/actions)
[![Coverage Status](https://coveralls.io/repos/github/1inch/farming/badge.svg?branch=master)](https://coveralls.io/github/1inch/farming?branch=master)

### About

This repository offers 2 ways to have farming (incentives). Highly recommend to use second option for pools/share/utility tokens by deriving them from `ERC20Farmable` smart contract. If it's too late you should consider first option as well:

1. [`FarmingPool.sol`](https://github.com/1inch/farming/blob/master/contracts/FarmingPool.sol) offers smart contract where you can stake/deposit specific tokens to get continiously distributed rewards.
2. [`ERC20Farmable.sol`](https://github.com/1inch/farming/blob/master/contracts/ERC20Farmable.sol) allows derived tokens to have farming without necessarity to stake/deposit token into pool. Moreover it allows to have multiple farmings simultaneously and setup new farms permissionlessly.

### Installation

# _**!!! NOTICE: WAIT UNTILL FULLY AUDITED !!!**_

```sh
$ npm install @1inch/farming
```

or

```sh
$ yarn add @1inch/farming
```

### Usage

# _**!!! NOTICE: WAIT UNTILL FULLY AUDITED !!!**_

Once installed, you can use the contracts in the library by importing them. Just use `ERC20Farmable` instead of `ERC20` to derive from:

```solidity
pragma solidity ^0.8.0;

import "@1inch/farming/contracts/ERC20Farmable.sol";

contract AMMPoolToken is ERC20Farmable {
    constructor() ERC20("AMMPoolToken", "AMM") {
    }
}
```

### Optimizations

- Storage access:
    - [1 storage slot](https://github.com/1inch/farming/blob/master/contracts/accounting/FarmAccounting.sol#L9-L11) for farming params, updated only on farming restarting:
        ```solidity
        uint40 public finished;
        uint32 public duration;
        uint184 public reward;
        ```
    - [1 storage slot](https://github.com/1inch/farming/blob/master/contracts/accounting/UserAccounting.sol#L7-L8) for farming state, updated only on changing number of farming tokens:
        ```solidity
        uint40 public checkpoint;
        uint216 public farmedPerTokenStored;
        ```
    - [1 storage slot](https://github.com/1inch/farming/blob/master/contracts/accounting/UserAccounting.sol#L9) per each farmer, updated on deposits/withdrawals (kudos to [@snjax](https://github.com/snjax)):

        ```solidity
        mapping(address => int256) public corrections;
        ```
- Compact address array is used for storing farms per user/wallet. Array length is stored in high bits of the first array item:
    - [@1inch/solidity-utils/AddressArray.sol](https://github.com/1inch/solidity-utils/blob/master/contracts/libraries/AddressArray.sol)
