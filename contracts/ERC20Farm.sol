// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IERC20Farm.sol";
import "./interfaces/IERC20Farmable.sol";
import "./interfaces/IRewardsDistributor.sol";


contract ERC20Farm is IERC20Farm, IRewardsDistributor {
    using SafeERC20 for IERC20;

    event RewardAdded(uint256 reward, uint256 duration);

    IERC20Farmable public immutable stakingToken;
    IERC20 public immutable rewardsToken;
    bool public immutable allowSlowDown;

    uint40 public finished;
    uint40 public duration;
    uint176 public reward;

    constructor(IERC20Farmable stakingToken_, IERC20 rewardsToken_, bool allowSlowDown_) {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
        allowSlowDown = allowSlowDown_;
    }

    function options() external view override returns(uint256 finished_, uint256 duration_, uint256 reward_) {
        return (finished, duration, reward);
    }

    function claimFor(address account, uint256 amount) external override {
        require(msg.sender == address(stakingToken), "ERC20: Access denied");
        rewardsToken.safeTransfer(account, amount);
    }

    function startFarming(uint256 amount, uint256 period) external onlyRewardsDistributor override {
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        stakingToken.update(this);

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            require(block.timestamp + period >= prevFinish, "FP: farming shortening denied");
            uint256 elapsed = block.timestamp + prevDuration - prevFinish;
            amount += prevReward - prevReward * elapsed / prevDuration;
            require(allowSlowDown || amount * prevDuration > prevReward * period, "FP: can't lower speed");
        }

        require(period < 2**40, "FP: Period too large");
        require(amount < 2**192, "FP: Amount too large");
        (finished, duration, reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        emit RewardAdded(reward, period);
    }
}
