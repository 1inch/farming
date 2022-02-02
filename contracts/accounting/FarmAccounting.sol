// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

library FarmAccounting {
    struct Info {
        uint40 finished;
        uint40 duration;
        uint176 reward;
    }

    /// @dev Requires extra 18 decimals for precision, result should not exceed 10**54
    function farmedSinceCheckpointScaled(Info memory info, uint256 checkpoint) internal view returns(uint256 amount) {
        require(checkpoint >= info.finished - info.duration, "FA: Checkpoint >= started");
        if (info.duration > 0) {
            uint256 elapsed = Math.min(block.timestamp, info.finished) - Math.min(checkpoint, info.finished);
            return elapsed * info.reward * 1e18 / info.duration;
        }
    }

    function startFarming(Info storage info, uint256 amount, uint256 period, function() internal updateCheckpoint) internal returns(uint256) {
        // If something left from prev farming add it to the new farming
        Info memory prev = info;
        if (block.timestamp < prev.finished) {
            amount += prev.reward - farmedSinceCheckpointScaled(prev, prev.finished - prev.duration) / 1e18;
        }

        updateCheckpoint();
        require(period + block.timestamp <= type(uint40).max, "FA: Period too large");
        require(amount <= type(uint176).max, "FA: Amount too large");
        (info.finished, info.duration, info.reward) = (uint40(block.timestamp + period), uint40(period), uint176(amount));
        return amount;
    }
}
