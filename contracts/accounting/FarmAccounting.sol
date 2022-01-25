// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

library FarmAccounting {
    struct Info {
        uint40 finished;
        uint40 duration;
        uint176 reward;
    }

    /// @dev Use block.timestamp for checkpoint if needed, try not to revert
    function onCheckpointUpdate(Info storage info) internal {}

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(Info memory info, uint256 checkpoint) internal view returns(uint256 amount) {
        require(checkpoint >= info.finished - info.duration, "Checkpoint must be >= started");
        if (info.duration > 0) {
            uint256 elapsed = Math.min(block.timestamp, info.finished) - checkpoint;
            return elapsed * info.reward * 1e18 / info.duration;
        }
    }

    function startFarming(Info storage info, uint256 amount, uint256 period) internal returns(uint256) {
        // If something left from prev farming add it to the new farming
        Info memory prev = info;
        if (block.timestamp < prev.finished) {
            amount += prev.reward - farmedSinceCheckpointScaled(prev, prev.finished - prev.duration) / 1e18;
        }

        require(period < 2**40, "FA: Period too large");
        require(amount < 2**176, "FA: Amount too large");
        (info.finished, info.duration, info.reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));
        return amount;
    }
}
