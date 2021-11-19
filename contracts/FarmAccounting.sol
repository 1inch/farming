// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IFarmAccounting.sol";
import "./DistributorAccess.sol";

abstract contract FarmAccounting is IFarmAccounting, DistributorAccess {
    using SafeERC20 for IERC20;

    event RewardAdded(uint256 reward, uint256 duration);

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    uint40 public finished;
    uint40 public duration;
    uint176 public reward;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_) {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function _updateFarmingState() internal virtual;

    function startFarming(uint256 amount, uint256 period) external onlyDistributor {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        _updateFarmingState();

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            require(block.timestamp + period >= prevFinish, "FP: farming shortening denied");
            uint256 elapsed = block.timestamp + prevDuration - prevFinish;
            amount += prevReward - prevReward * elapsed / prevDuration;
        }

        require(period < 2**40, "FP: Period too large");
        require(amount < 2**192, "FP: Amount too large");
        (finished, duration, reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        emit RewardAdded(reward, period);
    }
}
