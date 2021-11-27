// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IFarmAccounting.sol";

interface IERC20Farm is IFarmAccounting {
    function claimFor(address account, uint256 amount) external returns(uint256 remaining);
}
