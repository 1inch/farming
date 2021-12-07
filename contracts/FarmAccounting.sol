// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";

import "./interfaces/IFarmAccounting.sol";

abstract contract FarmAccounting is IFarmAccounting, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardsToken;

    uint40 public finished;
    uint40 public duration;
    uint176 public reward;

    address public distributor;

    constructor(IERC20 stakingToken_, IERC20 rewardsToken_) {
        stakingToken = stakingToken_;
        rewardsToken = rewardsToken_;
    }

    function setDistributor(address distributor_) external onlyOwner {
        distributor = distributor_;
    }

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    // solhint-disable-next-line no-empty-blocks
    function farmingCheckpoint() public virtual override {}

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpoint(uint256 checkpoint) public view virtual override returns(uint256 amount) {
        (uint256 finished_, uint256 duration_, uint256 reward_) = (finished, duration, reward);
        if (duration_ > 0) {
            return (Math.min(block.timestamp, finished_) - checkpoint) * reward_ * 1e18 / duration_;
        }
    }

    function startFarming(uint256 amount, uint256 period) external {
        require(msg.sender == distributor, "FA: access denied");
        rewardsToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update farming state
        _updateFarmingState();

        // If something left from prev farming add it to the new farming
        (uint256 prevFinish, uint256 prevDuration, uint256 prevReward) = (finished, duration, reward);
        if (block.timestamp < prevFinish) {
            uint256 elapsed = prevDuration - (prevFinish - block.timestamp);
            amount += prevReward - prevReward * elapsed / prevDuration;
        }

        require(period < 2**40, "FA: Period too large");
        require(amount < 2**176, "FA: Amount too large");
        (finished, duration, reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        emit RewardAdded(reward, period);
    }

    function _updateFarmingState() internal virtual;
}
