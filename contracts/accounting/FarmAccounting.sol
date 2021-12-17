// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

abstract contract FarmAccounting {
    struct FarmInfo {
        uint40 finished;
        uint40 duration;
        uint176 reward;
    }

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    function _farmingCheckpoint(FarmInfo storage info) internal {}

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function _farmedSinceCheckpointScaled(FarmInfo storage info, uint256 checkpoint) internal view returns(uint256 amount) {
        FarmInfo memory local = info;
        if (local.duration > 0) {
            return (Math.min(block.timestamp, local.finished) - checkpoint) * local.reward * 1e18 / local.duration;
        }
    }

    function _startFarming(FarmInfo storage info, uint256 amount, uint256 period) internal returns(uint256 reward){
        // Update farming state
        _updateFarmingState();

        // If something left from prev farming add it to the new farming
        FarmInfo memory prev = info;
        if (block.timestamp < prev.finished) {
            uint256 elapsed = prev.duration - (prev.finished - block.timestamp);
            amount += prev.reward - prev.reward * elapsed / prev.duration;
        }

        require(period < 2**40, "FA: Period too large");
        require(amount < 2**176, "FA: Amount too large");
        (info.finished, info.duration, info.reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));

        return amount;
    }

    function _updateFarmingState() internal virtual;
}
