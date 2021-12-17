// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farm.sol";
import "./interfaces/IERC20Farmable.sol";
import "./FarmAccounting.sol";

contract ERC20Farm is IERC20Farm, FarmAccounting {
    using SafeERC20 for IERC20;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_)
        FarmAccounting(stakingToken_, rewardsToken_)
    {}

    function claimFor(address account, uint256 amount) external override {
        require(msg.sender == address(stakingToken), "ERC20: Access denied");
        rewardsToken.safeTransfer(account, amount);
    }

    function _updateFarmingState() internal override {
        IERC20Farmable(address(stakingToken)).checkpoint(address(this));
    }
}
