// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library UserAccounting {
    struct Info {
        uint40 checkpoint;
        uint216 farmedPerTokenStored;
        mapping(address => int256) corrections;
    }

    uint256 constant internal _SCALE = 1e18;

    function farmedPerToken(
        Info storage info,
        function() internal view returns(uint256) lazyGetSupply,
        function(uint256) internal view returns(uint256) lazyGetFarmed
    ) internal view returns(uint256) {
        (uint256 checkpoint, uint256 fpt) = (info.checkpoint, info.farmedPerTokenStored);
        if (block.timestamp != checkpoint) {
            uint256 supply = lazyGetSupply();
            if (supply > 0) {
                fpt += lazyGetFarmed(checkpoint) / supply;
            }
        }
        return fpt;
    }

    function farmed(Info storage info, address account, uint256 balance, uint256 fpt) internal view returns(uint256) {
        return uint256(int256(balance * fpt) - info.corrections[account]) / _SCALE;
    }

    function eraseFarmed(Info storage info, address account, uint256 balance, uint256 fpt) internal {
        info.corrections[account] = int256(balance * fpt);
    }

    function updateCheckpoint(Info storage info, uint256 fpt) internal {
        (info.checkpoint, info.farmedPerTokenStored) = (uint40(block.timestamp), uint216(fpt));
    }

    function updateBalances(Info storage info, uint256 fpt, address from, address to, uint256 amount) internal {
        bool fromNonZero = from != address(0);
        bool toNonZero = to != address(0);
        if (from != to && amount > 0) {
            if (fromNonZero != toNonZero) {
                updateCheckpoint(info, fpt);
            }

            int256 diff = int256(amount * fpt);
            if (fromNonZero) {
                info.corrections[from] -= diff;
            }
            if (toNonZero) {
                info.corrections[to] += diff;
            }
        }
    }
}
