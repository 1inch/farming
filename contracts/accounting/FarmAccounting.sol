// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

library FarmAccounting {
    error CheckpointBeforeStarted();
    error ZeroDuration();
    error DurationTooLarge();
    error AmountTooLarge();

    struct Info {
        uint40 finished;
        uint32 duration;
        uint184 reward;  // requires 16M startFarming calls to overflow
    }

    uint256 constant internal _MAX_REWARD_AMOUNT = 1e42;  // 140 bits
    uint256 constant internal _SCALE = 1e18;  // 60 bits

    /// @dev Requires extra 18 decimals for precision, result fits in 200 bits
    function farmedSinceCheckpointScaled(Info memory info, uint256 checkpoint) internal view returns(uint256 amount) {
        if (checkpoint < info.finished - info.duration) revert CheckpointBeforeStarted();
        if (info.duration > 0) {
            uint256 elapsed = Math.min(block.timestamp, info.finished) - Math.min(checkpoint, info.finished);
            // size of (type(uint32).max * _MAX_REWARD_AMOUNT * _SCALE) is less than 232 bits, so there is no overflow
            return elapsed * info.reward * _SCALE / info.duration;
        }
    }

    function startFarming(Info storage info, uint256 amount, uint256 period) internal returns(uint256) {
        if (period == 0) revert ZeroDuration();
        if (period > type(uint32).max) revert DurationTooLarge();
        if (amount > _MAX_REWARD_AMOUNT) revert AmountTooLarge();

        // If something left from prev farming add it to the new farming
        Info memory prev = info;
        if (block.timestamp < prev.finished) {
            amount += prev.reward - farmedSinceCheckpointScaled(prev, prev.finished - prev.duration) / _SCALE;
        }

        (info.finished, info.duration, info.reward) = (uint40(block.timestamp + period), uint32(period), uint184(amount));
        return amount;
    }
}
