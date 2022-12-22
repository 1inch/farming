// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/Math.sol";

library FarmAccounting {
    error ZeroDuration();
    error DurationTooLarge();
    error AmountTooLarge();

    struct Info {
        uint40 finished;
        uint32 duration;
        uint184 reward;
    }

    uint256 internal constant _MAX_REWARD_AMOUNT = 1e32;  // 108 bits
    uint256 internal constant _SCALE = 1e18;  // 60 bits

    /// @dev Requires extra 18 decimals for precision, result fits in 168 bits
    function farmedSinceCheckpointScaled(Info memory info, uint256 checkpoint) internal view returns(uint256 amount) {
        unchecked {
            if (info.duration > 0) {
                uint256 elapsed = Math.min(block.timestamp, info.finished) - Math.min(checkpoint, info.finished);
                // size of (type(uint32).max * _MAX_REWARD_AMOUNT * _SCALE) is less than 200 bits, so there is no overflow
                return elapsed * info.reward * _SCALE / info.duration;
            }
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
